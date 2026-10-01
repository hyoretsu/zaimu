import { describe, expect, test } from "bun:test";
import { namespacesForEvent } from "~/shared/application/cache-invalidation";
import { createEventEnvelope } from "~/shared/application/events";
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

class FlakyCache extends MemoryCache {
	available = true;
	private assertAvailable() {
		if (!this.available) throw new Error("Redis unavailable");
	}
	override async delete(key: string) {
		this.assertAvailable();
		return super.delete(key);
	}
	override async get(key: string) {
		this.assertAvailable();
		return super.get(key);
	}
	override async increment(key: string) {
		this.assertAvailable();
		return super.increment(key);
	}
	override async releaseLock(key: string, owner: string) {
		this.assertAvailable();
		return super.releaseLock(key, owner);
	}
	override async set(key: string, value: string, options: { onlyIfAbsent?: boolean } = {}) {
		this.assertAvailable();
		return super.set(key, value, options);
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

	test("bypasses failures and advances the epoch after reconnecting", async () => {
		const storage = new FlakyCache();
		const cache = new DistributedCache(storage);
		let loads = 0;
		await cache.remember("user", "dashboard", {}, async () => `value-${++loads}`);
		storage.available = false;
		const startedAt = performance.now();
		const bypassed = await cache.remember("user", "dashboard", {}, async () => `value-${++loads}`);
		expect(bypassed.value).toBe("value-2");
		expect(performance.now() - startedAt).toBeLessThan(100);
		storage.available = true;
		const reconnected = await cache.remember("user", "dashboard", {}, async () => `value-${++loads}`);
		const hit = await cache.remember("user", "dashboard", {}, async () => `value-${++loads}`);
		expect(storage.data.get("zaimu:cache:epoch")).toBe("2");
		expect(reconnected.value).toBe("value-3");
		expect(hit).toEqual({ ...reconnected, hit: true });
		expect(loads).toBe(3);
	});
});

describe("catalog and loan read consistency", () => {
	test("category edits invalidate summary and detail while preserving other users and stores", async () => {
		const cache = new DistributedCache(new MemoryCache());
		await cache.remember("owner", "categories:list", {}, async () => ["old"]);
		await cache.remember("owner", "categories:detail", { id: "category" }, async () => "old");
		await cache.remember("peer", "categories:detail", { id: "category" }, async () => "peer");
		await cache.remember("owner", "stores:list", {}, async () => ["store"]);
		const namespaces = namespacesForEvent(
			createEventEnvelope({
				aggregateId: "category",
				aggregateType: "category",
				correlationId: "edit",
				eventType: "updated",
				payload: {},
				userIds: ["owner"],
			}),
		);
		await cache.beginWrite("owner", namespaces);
		expect(await cache.read("owner", "categories:detail", { id: "category" })).toBeUndefined();
		await cache.finishWrite("owner", namespaces);
		expect(await cache.read("owner", "categories:list", {})).toBeUndefined();
		expect(await cache.read("owner", "categories:detail", { id: "category" })).toBeUndefined();
		expect((await cache.read("peer", "categories:detail", { id: "category" }))?.value).toBe("peer");
		expect((await cache.read("owner", "stores:list", {}))?.value).toEqual(["store"]);
	});

	test("loan payments invalidate detail and history together", async () => {
		const cache = new DistributedCache(new MemoryCache());
		await cache.remember("owner", "loans:detail", { id: "loan" }, async () => "unpaid");
		await cache.remember("owner", "loans:history", { limit: 50, loanId: "loan" }, async () => []);
		const namespaces = namespacesForEvent(
			createEventEnvelope({
				aggregateId: "loan",
				aggregateType: "loan",
				correlationId: "payment",
				eventType: "updated",
				payload: {},
				userIds: ["owner"],
			}),
		);
		await cache.beginWrite("owner", namespaces);
		await cache.finishWrite("owner", namespaces);
		expect(await cache.read("owner", "loans:detail", { id: "loan" })).toBeUndefined();
		expect(await cache.read("owner", "loans:history", { limit: 50, loanId: "loan" })).toBeUndefined();
	});
});
