import { describe, expect, test } from "bun:test";
import { RedisCache } from "./RedisCache";

const redisUrl = process.env.CACHE_TEST_REDIS_URL;
const suite = redisUrl ? describe : describe.skip;

suite("isolated Redis write fences", () => {
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
