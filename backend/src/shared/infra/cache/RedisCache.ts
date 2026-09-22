import { RedisClient } from "bun";
import type { CachePort } from "~/shared/application/ports";

export class RedisCache implements CachePort {
	readonly client: RedisClient;
	constructor(url = process.env.REDIS_URL) {
		this.client = new RedisClient(url, { autoReconnect: true, connectionTimeout: 2_000 });
	}
	async delete(key: string) {
		await this.client.del(key);
	}
	get(key: string) {
		return this.client.get(key);
	}
	increment(key: string) {
		return this.client.incr(key);
	}
	async set(key: string, value: string, options: { onlyIfAbsent?: boolean; ttlMs?: number } = {}) {
		const redisOptions = [
			...(options.ttlMs ? ["PX", String(options.ttlMs)] : []),
			...(options.onlyIfAbsent ? ["NX"] : []),
		];
		return (await this.client.set(key, value, ...redisOptions)) === "OK";
	}
}
