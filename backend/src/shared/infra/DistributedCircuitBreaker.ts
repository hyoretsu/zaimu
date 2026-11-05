import { RedisClient } from "bun";
import { cacheKey } from "./service-namespace";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type CircuitOutcome = "success" | "failure" | "ignore";
export interface CircuitTransition {
	from: CircuitState;
	to: CircuitState;
	at: number;
	service: string;
}
export interface CircuitSnapshot {
	state: CircuitState;
	failures: number;
	samples: number;
	openedAt: number | null;
}
export interface CircuitPermit {
	generation: number;
	probe: number | null;
	token: number;
	issuedAt: number;
}

export class CircuitUnavailableError extends Error {
	constructor(service: string, cause?: unknown) {
		super(`Circuit breaker unavailable for ${service}`, { cause });
		this.name = "CircuitUnavailableError";
	}
}
export class CircuitOpenError extends Error {
	constructor(service: string) {
		super(`Circuit breaker open for ${service}`);
		this.name = "CircuitOpenError";
	}
}

export interface CircuitOptions {
	service: string;
	windowMs: number;
	minimumSamples: number;
	failureThreshold: number;
	openMs: number;
	probeLeaseMs: number;
	classify: (result: { value?: unknown; error?: unknown }) => CircuitOutcome;
	onTransition?: (transition: CircuitTransition) => void;
}

// All timestamps come from Redis TIME, so workers with different clocks agree.
// The sample sequence lives in the same hash as state and is advanced only inside Lua.
const acquireScript = `
local k, samples = KEYS[1], KEYS[2]
local time = redis.call('TIME'); local now = time[1]*1000 + math.floor(time[2]/1000)
local state = redis.call('HGET',k,'state') or 'CLOSED'
local generation = tonumber(redis.call('HGET',k,'generation') or '0')
local from = ''
if state == 'OPEN' and now - tonumber(redis.call('HGET',k,'openedAt') or '0') >= tonumber(ARGV[1]) then
  from = 'OPEN'; state = 'HALF_OPEN'; generation = generation + 1
  redis.call('HSET',k,'state',state,'generation',generation)
end
if state == 'HALF_OPEN' then
  local untilTime = tonumber(redis.call('HGET',k,'leaseUntil') or '0')
  if untilTime > 0 then
    if untilTime > now then return {0,state,generation,0,now,from,0} end
    -- An expired probe is uncertain. Fence it and wait through another open interval.
    from = 'HALF_OPEN'; state = 'OPEN'; generation = generation + 1
    redis.call('HSET',k,'state',state,'generation',generation,'leaseUntil',0,'openedAt',now)
    return {0,state,generation,0,now,from,0}
  end
  local probe = redis.call('HINCRBY',k,'probe',1)
  local token = redis.call('HINCRBY',k,'sequence',1)
  redis.call('HSET',k,'leaseUntil',now+tonumber(ARGV[2]))
  return {1,state,generation,probe,now,from,token}
end
if state == 'OPEN' then return {0,state,generation,0,now,from,0} end
local token = redis.call('HINCRBY',k,'sequence',1)
return {1,state,generation,0,now,from,token}
`;

const completeScript = `
local k, samples, completed = KEYS[1], KEYS[2], KEYS[3]
local time = redis.call('TIME'); local now = time[1]*1000 + math.floor(time[2]/1000)
local state = redis.call('HGET',k,'state') or 'CLOSED'
local generation = tonumber(redis.call('HGET',k,'generation') or '0')
local from = ''
if generation ~= tonumber(ARGV[1]) then return {state,0,0,now,from} end
if state == 'HALF_OPEN' then
  if tonumber(redis.call('HGET',k,'probe') or '0') ~= tonumber(ARGV[2]) or tonumber(redis.call('HGET',k,'leaseUntil') or '0') <= now then
    return {state,0,0,now,from}
  end
  if ARGV[3] == 'ignore' then
    -- Retire this probe; an ignored outcome must not make its permit reusable.
    redis.call('HINCRBY',k,'probe',1)
    redis.call('HSET',k,'leaseUntil',0)
  else
    from = 'HALF_OPEN'; generation = generation + 1
    state = ARGV[3] == 'success' and 'CLOSED' or 'OPEN'
    redis.call('DEL',samples)
    redis.call('HSET',k,'state',state,'generation',generation,'leaseUntil',0,'openedAt',state == 'OPEN' and now or 0)
  end
elseif state == 'CLOSED' then
  -- A late completion can only be counted while its permit is inside the window.
  if tonumber(ARGV[7]) > now or now - tonumber(ARGV[7]) >= tonumber(ARGV[4]) then return {state,generation,0,now,from} end
  if redis.call('SET',completed,ARGV[8],'NX','PX',tonumber(ARGV[4])) == false then return {state,generation,0,now,from} end
  redis.call('ZREMRANGEBYSCORE',samples,'-inf',now-tonumber(ARGV[4]))
  if ARGV[3] ~= 'ignore' then
    -- A token is reserved at acquire; the completed key prevents duplicate or conflicting outcomes.
    redis.call('ZADD',samples,now,tostring(ARGV[8])..':'..ARGV[3])
    redis.call('PEXPIRE',samples,tonumber(ARGV[4]))
    local members = redis.call('ZRANGE',samples,0,-1)
    local failures = 0
    for _,member in ipairs(members) do if string.sub(member,-7) == 'failure' then failures = failures + 1 end end
    if #members >= tonumber(ARGV[5]) and failures / #members >= tonumber(ARGV[6]) then
      from = 'CLOSED'; state = 'OPEN'; generation = generation + 1
      redis.call('HSET',k,'state',state,'generation',generation,'openedAt',now)
    end
  end
end
return {state,generation,0,now,from}
`;

const inspectScript = `
local k, samples = KEYS[1], KEYS[2]
local time = redis.call('TIME'); local now = time[1]*1000 + math.floor(time[2]/1000)
redis.call('ZREMRANGEBYSCORE',samples,'-inf',now-tonumber(ARGV[1]))
local members = redis.call('ZRANGE',samples,0,-1)
local failures = 0
for _,member in ipairs(members) do if string.sub(member,-7) == 'failure' then failures = failures + 1 end end
return {redis.call('HGET',k,'state') or 'CLOSED',#members,failures,redis.call('HGET',k,'openedAt') or '0'}
`;

export class DistributedCircuitBreaker {
	private readonly client: RedisClient;
	private readonly ownsClient: boolean;
	private readonly stateKey: string;
	private readonly samplesKey: string;
	private readonly completedPrefix: string;

	constructor(
		private readonly options: CircuitOptions,
		client?: RedisClient,
	) {
		if (
			!/^[a-zA-Z0-9._:-]+$/.test(options.service) ||
			!Number.isInteger(options.windowMs) ||
			options.windowMs <= 0 ||
			!Number.isInteger(options.minimumSamples) ||
			options.minimumSamples <= 0 ||
			!Number.isFinite(options.failureThreshold) ||
			options.failureThreshold <= 0 ||
			options.failureThreshold > 1 ||
			!Number.isInteger(options.openMs) ||
			options.openMs <= 0 ||
			!Number.isInteger(options.probeLeaseMs) ||
			options.probeLeaseMs <= 0
		)
			throw new RangeError("Invalid circuit breaker configuration");
		this.ownsClient = !client;
		this.client =
			client ?? new RedisClient(process.env.REDIS_URL, { autoReconnect: true, connectionTimeout: 500 });
		// Braces keep both keys in the same Redis Cluster slot.
		const prefix = cacheKey(`circuit:{${options.service}}`);
		this.stateKey = `${prefix}:state`;
		this.samplesKey = `${prefix}:samples`;
		this.completedPrefix = `${prefix}:completed:`;
	}

	private async eval(script: string, args: string[], completedKey?: string): Promise<unknown[]> {
		try {
			const keys = completedKey
				? [this.stateKey, this.samplesKey, completedKey]
				: [this.stateKey, this.samplesKey];
			return (await this.client.send("EVAL", [
				script,
				String(keys.length),
				...keys,
				...args,
			])) as unknown[];
		} catch (cause) {
			throw new CircuitUnavailableError(this.options.service, cause);
		}
	}

	private transition(from: string, to: CircuitState, at: number) {
		if (from)
			this.options.onTransition?.({
				at,
				from: from as CircuitState,
				service: this.options.service,
				to,
			});
	}

	async acquire(): Promise<CircuitPermit> {
		const [allowed, state, generation, probe, at, from, token] = await this.eval(acquireScript, [
			String(this.options.openMs),
			String(this.options.probeLeaseMs),
		]);
		this.transition(String(from), String(state) as CircuitState, Number(at));
		if (!Number(allowed)) throw new CircuitOpenError(this.options.service);
		return {
			generation: Number(generation),
			issuedAt: Number(at),
			probe: Number(probe) || null,
			token: Number(token),
		};
	}

	async complete(permit: CircuitPermit, outcome: CircuitOutcome): Promise<void> {
		if (!["success", "failure", "ignore"].includes(outcome))
			throw new TypeError("Unknown circuit outcome");
		const [state, , , at, from] = await this.eval(
			completeScript,
			[
				String(permit.generation),
				String(permit.probe ?? 0),
				outcome,
				String(this.options.windowMs),
				String(this.options.minimumSamples),
				String(this.options.failureThreshold),
				String(permit.issuedAt),
				String(permit.token),
			],
			`${this.completedPrefix}${permit.generation}:${permit.token}`,
		);
		this.transition(String(from), String(state) as CircuitState, Number(at));
	}

	async inspect(): Promise<CircuitSnapshot> {
		const [state, samples, failures, openedAt] = await this.eval(inspectScript, [
			String(this.options.windowMs),
		]);
		return {
			failures: Number(failures),
			openedAt: Number(openedAt) || null,
			samples: Number(samples),
			state: String(state) as CircuitState,
		};
	}

	/** Runs the operation once. Classification is explicit; no automatic retries are performed. */
	async execute<T>(operation: () => Promise<T>): Promise<T> {
		const permit = await this.acquire();
		let value: T;
		try {
			value = await operation();
		} catch (error) {
			const outcome = this.options.classify({ error });
			await this.complete(permit, outcome);
			throw error;
		}
		await this.complete(permit, this.options.classify({ value }));
		return value;
	}

	close(): void {
		if (this.ownsClient) this.client.close();
	}
}
