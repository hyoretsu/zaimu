import { describe, expect, test } from "bun:test";
import type { CachePort } from "~/shared/application/ports";
import { DistributedCache } from "./DistributedCache";

class MemoryCache implements CachePort {
	data = new Map<string, string>();
	async delete(key: string) {
		this.data.delete(key);
	}
	async get(key: string) {
		return this.data.get(key) ?? null;
	}
	async increment(key: string) {
		const next = Number(this.data.get(key) ?? 0) + 1;
		this.data.set(key, String(next));
		return next;
	}
	async releaseLock(key: string, owner: string) {
		if (this.data.get(key) === owner) this.data.delete(key);
	}
	async set(key: string, value: string, options: { onlyIfAbsent?: boolean } = {}) {
		if (options.onlyIfAbsent && this.data.has(key)) return false;
		this.data.set(key, value);
		return true;
	}
}

describe("DistributedCache", () => {
	test("canonicalizes parameters and returns cache hits without loading", async () => {
		const cache = new DistributedCache(new MemoryCache());
		let loads = 0;
		const first = await cache.remember("user", "dashboard", { a: 1, b: 2 }, async () => ({ loads: ++loads }));
		const second = await cache.remember("user", "dashboard", { a: 1, b: 2 }, async () => ({
			loads: ++loads,
		}));
		expect(first.hit).toBe(false);
		expect(second).toEqual({ ...first, hit: true });
		expect(loads).toBe(1);
	});

	test("coalesces concurrent cold reads", async () => {
		const cache = new DistributedCache(new MemoryCache());
		let loads = 0;
		const load = async () => {
			loads += 1;
			await Bun.sleep(5);
			return "value";
		};
		await Promise.all([
			cache.remember("user", "transactions:list", {}, load),
			cache.remember("user", "transactions:list", {}, load),
		]);
		expect(loads).toBe(1);
	});

	test("coalesces cold reads across cache instances with a distributed lock", async () => {
		const storage = new MemoryCache();
		const firstCache = new DistributedCache(storage);
		const secondCache = new DistributedCache(storage);
		let loads = 0;
		const load = async () => {
			loads += 1;
			await Bun.sleep(20);
			return "value";
		};
		const [first, second] = await Promise.all([
			firstCache.remember("user", "dashboard", {}, load),
			secondCache.remember("user", "dashboard", {}, load),
		]);
		expect(first.value).toBe("value");
		expect(second.value).toBe("value");
		expect(loads).toBe(1);
	});

	test("write fence bypasses old value and generation invalidates it", async () => {
		const cache = new DistributedCache(new MemoryCache());
		await cache.remember("user", "accounts:list", {}, async () => "old");
		await cache.beginWrite("user", ["accounts:list"]);
		const duringWrite = await cache.read("user", "accounts:list", {});
		expect(duringWrite).toBeUndefined();
		await cache.finishWrite("user", ["accounts:list"]);
		const afterWrite = await cache.remember("user", "accounts:list", {}, async () => "new");
		expect(afterWrite.value).toBe("new");
	});
});
