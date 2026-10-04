import { getQueryMetrics, measureOperation } from "sql";

export class RedisUnavailableError extends Error {
	constructor(readonly reason: "timeout" | "circuit-open" | "budget-exhausted" | "unavailable") {
		super(`Redis ${reason}`);
	}
}
// Shared by every Redis consumer in the request, including authentication.
export class RedisBudget {
	private retryAt = 0;
	private version = 0;
	private probe: Promise<unknown> | undefined;
	constructor(
		private readonly cooldownMs = 1000,
		private readonly timeoutMs = 100,
	) {}
	async run<Result>(operation: () => Promise<Result>): Promise<Result> {
		const version = this.version;
		const metrics = getQueryMetrics();
		const remaining = this.timeoutMs - (metrics?.redisWaitMs ?? 0);
		if (remaining <= 0) throw new RedisUnavailableError("budget-exhausted");
		if (performance.now() < this.retryAt || this.probe) throw new RedisUnavailableError("circuit-open");
		const startedAt = performance.now();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const attempt = measureOperation("redis", () =>
			Promise.race([
				Promise.resolve().then(operation),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new RedisUnavailableError("timeout")), remaining);
				}),
			]),
		);
		const recovering = this.retryAt > 0;
		if (recovering) this.probe = attempt;
		try {
			const result = await attempt;
			if (this.version === version) this.retryAt = 0;
			return result;
		} catch (error) {
			this.version++;
			this.retryAt = performance.now() + this.cooldownMs;
			throw error;
		} finally {
			if (timer) clearTimeout(timer);
			this.probe = undefined;
			if (metrics?.active) metrics.redisWaitMs += performance.now() - startedAt;
		}
	}
}
