import { RedisClient } from "bun";
import type { CacheGuard, CachePort } from "~/shared/application/ports";
import { cacheKey } from "../service-namespace";

const cleanupQueue = () => cacheKey("cache:cleanup");

export class RedisCache implements CachePort {
	private cleanup: Promise<void> | undefined;
	private scheduleCleanup() {
		if (!this.cleanup)
			this.cleanup = this.cleanupGenerations()
				.catch(() => {})
				.finally(() => {
					this.cleanup = undefined;
				});
	}
	async cleanupGenerations() {
		// Each batch unlinks at most 128 entries. Queue and registry stay durable across crashes.
		while (
			Number(
				await this.client.send("EVAL", [
					`local registry=redis.call("LINDEX",KEYS[1],0); if not registry then return 0 end;
 local entries=redis.call("SPOP",registry,128);
 for _,entry in ipairs(entries) do
 local memberships=entry..":registries";
 for _,other in ipairs(redis.call("SMEMBERS",memberships)) do
 redis.call("SREM",other,entry); if redis.call("SCARD",other)==0 then redis.call("UNLINK",other) end;
 end;
 redis.call("UNLINK",entry,memberships);
 end;
 if redis.call("SCARD",registry)==0 then redis.call("UNLINK",registry); redis.call("LPOP",KEYS[1]) end;
 return redis.call("LLEN",KEYS[1])`,
					"1",
					cleanupQueue(),
				]),
			) > 0
		)
			await Bun.sleep(0);
	}
	async getRegistered(key: string, guards: CacheGuard[]) {
		return (await this.client.send("EVAL", [
			`local t=redis.call("TIME"); local now=t[1]*1000+math.floor(t[2]/1000);
 for i=1,#KEYS-1,2 do
 if (redis.call("GET",KEYS[i+1]) or "0") ~= ARGV[(i+1)/2] then return false end;
 if KEYS[i+2] ~= "" then redis.call("ZREMRANGEBYSCORE",KEYS[i+2],"-inf",now); if redis.call("ZCARD",KEYS[i+2])>0 then return false end end;
 end;
 return redis.call("GET",KEYS[1])`,
			String(1 + guards.length * 2),
			key,
			...guards.flatMap(guard => [guard.generationKey, guard.fenceKey ?? ""]),
			...guards.map(guard => guard.generation),
		])) as string | null;
	}

	async setRegistered(key: string, value: string, guards: CacheGuard[]) {
		const accepted =
			Number(
				await this.client.send("EVAL", [
					`local t=redis.call("TIME"); local now=t[1]*1000+math.floor(t[2]/1000);
 for i=1,#KEYS-1,2 do
 local generation=redis.call("GET",KEYS[i+1]) or "0";
 if generation ~= ARGV[(i+1)/2+1] then return 0 end;
 if KEYS[i+2] ~= "" then redis.call("ZREMRANGEBYSCORE",KEYS[i+2],"-inf",now); if redis.call("ZCARD",KEYS[i+2])>0 then return 0 end end;
 end;
 redis.call("SET",KEYS[1],ARGV[1]);
 for i=1,#KEYS-1,2 do
 local registry=KEYS[i+1]..":entries:"..ARGV[(i+1)/2+1];
 redis.call("SADD",registry,KEYS[1]); redis.call("SADD",KEYS[1]..":registries",registry);
 end;
 return 1`,
					String(1 + guards.length * 2),
					key,
					...guards.flatMap(guard => [guard.generationKey, guard.fenceKey ?? ""]),
					value,
					...guards.map(guard => guard.generation),
				]),
			) === 1;
		this.scheduleCleanup();
		return accepted;
	}
	readonly client: RedisClient;
	constructor(url = process.env.REDIS_URL) {
		this.client = new RedisClient(url, { autoReconnect: true, connectionTimeout: 2_000 });
	}
	async beginFence(key: string, token: string, leaseMs: number) {
		await this.client.send("EVAL", [
			'local t=redis.call("TIME"); local now=t[1]*1000+math.floor(t[2]/1000); redis.call("ZREMRANGEBYSCORE",KEYS[1],"-inf",now); redis.call("ZADD",KEYS[1],now+tonumber(ARGV[2]),ARGV[1]); redis.call("PEXPIRE",KEYS[1],ARGV[2]); return 1',
			"1",
			key,
			token,
			String(leaseMs),
		]);
	}
	async hasFence(key: string) {
		return (
			Number(
				await this.client.send("EVAL", [
					'local t=redis.call("TIME"); redis.call("ZREMRANGEBYSCORE",KEYS[1],"-inf",t[1]*1000+math.floor(t[2]/1000)); return redis.call("ZCARD",KEYS[1])',
					"1",
					key,
				]),
			) > 0
		);
	}
	async finishFence(generationKey: string, fenceKey: string, token?: string) {
		await this.client.send("EVAL", [
			'local old=redis.call("GET",KEYS[1]) or "0"; redis.call("INCR",KEYS[1]); local registry=KEYS[1]..":entries:"..old; if redis.call("EXISTS",registry)==1 then redis.call("RPUSH",KEYS[3],registry) end; if ARGV[1] ~= "" then redis.call("ZREM",KEYS[2],ARGV[1]) end; return 1',
			"3",
			generationKey,
			fenceKey,
			cleanupQueue(),
			token ?? "",
		]);
		this.scheduleCleanup();
	}
	async delete(key: string) {
		await this.client.del(key);
	}
	get(key: string) {
		return this.client.get(key);
	}
	async increment(key: string) {
		const generation = Number(
			await this.client.send("EVAL", [
				'local old=redis.call("GET",KEYS[1]) or "0"; local next=redis.call("INCR",KEYS[1]); local registry=KEYS[1]..":entries:"..old; if redis.call("EXISTS",registry)==1 then redis.call("RPUSH",KEYS[2],registry) end; return next',
				"2",
				key,
				cleanupQueue(),
			]),
		);
		this.scheduleCleanup();
		return generation;
	}
	async releaseLock(key: string, owner: string) {
		await this.client.send("EVAL", [
			'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
			"1",
			key,
			owner,
		]);
	}
	async set(key: string, value: string, options: { onlyIfAbsent?: boolean; ttlMs?: number } = {}) {
		const redisOptions = [
			...(options.ttlMs ? ["PX", String(options.ttlMs)] : []),
			...(options.onlyIfAbsent ? ["NX"] : []),
		];
		return (await this.client.set(key, value, ...redisOptions)) === "OK";
	}
}
