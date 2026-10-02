import { describe, expect, test } from "bun:test";
import { RedisCache } from "./RedisCache";

const redisUrl = process.env.CACHE_TEST_REDIS_URL;
const suite = redisUrl ? describe : describe.skip;

suite("isolated Redis write fences", () => {
	test("atomically registers entries, rejects stale writers and unlinks every registry membership", async () => {
		const url = new URL(redisUrl!);
		if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "6395")
			throw new Error("Dedicated local Redis on port 6395 required");
		const cache = new RedisCache(redisUrl);
		const prefix = `zaimu:test:${crypto.randomUUID()}`;
		const epoch = `${prefix}:epoch`,
			generation = `${prefix}:generation`,
			family = `${prefix}:family`,
			fence = `${prefix}:fence`,
			entry = `${prefix}:entry`;
		const guards = [
			{ generation: "1", generationKey: epoch },
			{ fenceKey: fence, generation: "0", generationKey: generation },
			{ generation: "0", generationKey: family },
		];
		try {
			await cache.set(epoch, "1");
			expect(await cache.setRegistered(entry, "old", guards)).toBe(true);
			expect(await cache.getRegistered(entry, guards)).toBe("old");
			await cache.beginFence(fence, "writer", 1000);
			expect(await cache.getRegistered(entry, guards)).toBeNull();
			expect(await cache.setRegistered(`${entry}:blocked`, "blocked", guards)).toBe(false);
			await cache.finishFence(generation, fence, "writer");
			expect(await cache.setRegistered(`${entry}:late`, "late", guards)).toBe(false);
			expect(await cache.getRegistered(entry, guards)).toBeNull();
			await cache.cleanupGenerations();
			expect(await cache.get(entry)).toBeNull();
			expect(
				Number(
					await cache.client.send("EXISTS", [
						`${epoch}:entries:1`,
						`${family}:entries:0`,
						`${entry}:registries`,
					]),
				),
			).toBe(0);
			const next = guards.map(guard =>
				guard.generationKey === generation ? { ...guard, generation: "1" } : guard,
			);
			expect(await cache.setRegistered(entry, "new", next)).toBe(true);
			await cache.increment(epoch);
			expect(await cache.setRegistered(`${entry}:old-epoch`, "stale", next)).toBe(false);
			await cache.cleanupGenerations();
			expect(await cache.get(entry)).toBeNull();
		} finally {
			await cache.cleanupGenerations();
			for (const key of [epoch, generation, family, fence, entry]) await cache.delete(key);
			cache.client.close();
		}
	});
	test("serializes generations while retaining concurrent leases and expiring rollback leases", async () => {
		const url = new URL(redisUrl!);
		if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "6395")
			throw new Error("Dedicated local Redis on port 6395 required");
		const cache = new RedisCache(redisUrl);
		const prefix = `zaimu:test:${crypto.randomUUID()}`;
		const fence = `${prefix}:fence`;
		const generation = `${prefix}:generation`;
		try {
			await cache.beginFence(fence, "first", 1000);
			await cache.beginFence(fence, "second", 1000);
			await cache.finishFence(generation, fence, "first");
			expect(await cache.hasFence(fence)).toBe(true);
			await cache.finishFence(generation, fence);
			expect(await cache.hasFence(fence)).toBe(true);
			await cache.finishFence(generation, fence, "second");
			expect(await cache.hasFence(fence)).toBe(false);
			expect(await cache.get(generation)).toBe("3");
			await cache.beginFence(fence, "rollback", 20);
			await Bun.sleep(30);
			expect(await cache.hasFence(fence)).toBe(false);
		} finally {
			await cache.delete(fence);
			await cache.delete(generation);
			cache.client.close();
		}
	});
});
