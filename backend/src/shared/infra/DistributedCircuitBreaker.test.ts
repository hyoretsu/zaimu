import { afterAll, expect, test } from "bun:test";
import { RedisClient } from "bun";
import { requireFixtureUrl } from "../../../../scripts/testing/fixture";
import {
	CircuitOpenError,
	type CircuitOptions,
	type CircuitTransition,
	CircuitUnavailableError,
	DistributedCircuitBreaker,
} from "./DistributedCircuitBreaker";

requireFixtureUrl("CACHE_TEST_REDIS_URL");

const clients: RedisClient[] = [];
const breakers: DistributedCircuitBreaker[] = [];
const options = (service = crypto.randomUUID()): CircuitOptions => ({
	classify: ({ error }) => (error ? "failure" : "success"),
	failureThreshold: 0.5,
	minimumSamples: 3,
	openMs: 80,
	probeLeaseMs: 150,
	service,
	windowMs: 2000,
});
const create = (config: CircuitOptions, client?: RedisClient) => {
	const breaker = new DistributedCircuitBreaker(config, client);
	breakers.push(breaker);
	return breaker;
};
afterAll(() => {
	for (const breaker of breakers) breaker.close();
	for (const client of clients) client.close();
});

test("rolling window enforces minimum samples and failure ratio across instances", async () => {
	const config = options();
	const first = create(config);
	const second = create(config);
	await first.complete(await first.acquire(), "failure");
	await second.complete(await second.acquire(), "success");
	expect((await first.inspect()).state).toBe("CLOSED");
	await first.complete(await first.acquire(), "failure");
	expect(await second.inspect()).toMatchObject({ failures: 2, samples: 3, state: "OPEN" });
	await expect(second.acquire()).rejects.toBeInstanceOf(CircuitOpenError);
});

test("only one half-open probe is admitted and stale fencing cannot close it", async () => {
	const transitions: CircuitTransition[] = [];
	const config = {
		...options(),
		minimumSamples: 1,
		onTransition: (event: CircuitTransition) => transitions.push(event),
	};
	const first = create(config);
	const second = create(config);
	await first.complete(await first.acquire(), "failure");
	await Bun.sleep(95);
	const [a, b] = await Promise.allSettled([first.acquire(), second.acquire()]);
	const granted = [a, b].filter(result => result.status === "fulfilled");
	expect(granted).toHaveLength(1);
	const permit = (granted[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof first.acquire>>>).value;
	expect(permit.probe).not.toBeNull();
	await expect(first.acquire()).rejects.toBeInstanceOf(CircuitOpenError);
	await first.complete({ ...permit, generation: permit.generation - 1 }, "success");
	expect((await second.inspect()).state).toBe("HALF_OPEN");
	await second.complete(permit, "success");
	expect((await first.inspect()).state).toBe("CLOSED");
	expect(transitions.map(({ from, to }) => `${from}->${to}`)).toEqual([
		"CLOSED->OPEN",
		"OPEN->HALF_OPEN",
		"HALF_OPEN->CLOSED",
	]);
});

test("expired probe lease fences late completions and cools down before replacement", async () => {
	const config = { ...options(), minimumSamples: 1, openMs: 50, probeLeaseMs: 40 };
	const breaker = create(config);
	await breaker.complete(await breaker.acquire(), "failure");
	await Bun.sleep(60);
	const expired = await breaker.acquire();
	await Bun.sleep(55);
	await expect(breaker.acquire()).rejects.toBeInstanceOf(CircuitOpenError);
	expect((await breaker.inspect()).state).toBe("OPEN");
	await breaker.complete(expired, "success");
	expect((await breaker.inspect()).state).toBe("OPEN");
	await Bun.sleep(60);
	const replacement = await breaker.acquire();
	expect(replacement.probe).toBeGreaterThan(expired.probe!);
	await breaker.complete(replacement, "failure");
	expect((await breaker.inspect()).state).toBe("OPEN");
});

test("replaying one closed-state permit cannot inflate the rolling sample count", async () => {
	const breaker = create(options());
	const permit = await breaker.acquire();
	await breaker.complete(permit, "failure");
	await breaker.complete(permit, "success");
	expect(await breaker.inspect()).toMatchObject({ failures: 1, samples: 1, state: "CLOSED" });
});

test("ignored half-open probe retires its permit before admitting another", async () => {
	const breaker = create({ ...options(), minimumSamples: 1 });
	await breaker.complete(await breaker.acquire(), "failure");
	await Bun.sleep(95);
	const ignored = await breaker.acquire();
	await breaker.complete(ignored, "ignore");
	const replacement = await breaker.acquire();
	await breaker.complete(ignored, "failure");
	expect((await breaker.inspect()).state).toBe("HALF_OPEN");
	await breaker.complete(replacement, "success");
	expect((await breaker.inspect()).state).toBe("CLOSED");
});

test("classifier ignores chosen outcomes without retrying the operation", async () => {
	let attempts = 0;
	const breaker = create({
		...options(),
		classify: ({ error }) => (error ? "ignore" : "success"),
		minimumSamples: 1,
	});
	await expect(
		breaker.execute(async () => {
			attempts++;
			throw new Error("not counted");
		}),
	).rejects.toThrow("not counted");
	expect(attempts).toBe(1);
	expect(await breaker.inspect()).toMatchObject({ samples: 0, state: "CLOSED" });
});

test("Redis outage fails closed before operation execution", async () => {
	const client = new RedisClient("redis://127.0.0.1:1", { autoReconnect: false, connectionTimeout: 100 });
	clients.push(client);
	const breaker = create(options(), client);
	let called = false;
	await expect(
		breaker.execute(async () => {
			called = true;
		}),
	).rejects.toBeInstanceOf(CircuitUnavailableError);
	expect(called).toBe(false);
});
