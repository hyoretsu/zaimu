import { RedisClient } from "bun";
import type { CachePort } from "~/shared/application/ports";

export class RedisCache implements CachePort {
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
			'redis.call("INCR",KEYS[1]); if ARGV[1] ~= "" then redis.call("ZREM",KEYS[2],ARGV[1]) end; return 1',
			"2",
			generationKey,
			fenceKey,
			token ?? "",
		]);
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
