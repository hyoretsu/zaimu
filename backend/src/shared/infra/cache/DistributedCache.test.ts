import { describe, expect, test } from "bun:test";
import { namespacesForEvent } from "~/shared/application/cache-invalidation";
import { createEventEnvelope } from "~/shared/application/events";
import type { CacheGuard, CachePort } from "~/shared/application/ports";
import { cacheKey } from "../service-namespace";
import { DistributedCache } from "./DistributedCache";

class MemoryCache implements CachePort {
	data = new Map<string, string>();
	registries = new Map<string, Set<string>>();
	async getRegistered(key: string, guards: CacheGuard[]) {
		for (const guard of guards) {
			if (
				((await this.get(guard.generationKey)) ?? "0") !== guard.generation ||
				(guard.fenceKey && (await this.hasFence(guard.fenceKey)))
			)
				return null;
		}
		return this.get(key);
	}
	async setRegistered(key: string, value: string, guards: CacheGuard[]) {
		for (const guard of guards) {
			if (
				((await this.get(guard.generationKey)) ?? "0") !== guard.generation ||
				(guard.fenceKey && (await this.hasFence(guard.fenceKey)))
			)
				return false;
		}
		await this.set(key, value);
		for (const guard of guards) {
			const registryKey = `${guard.generationKey}:entries:${guard.generation}`;
			const registry = this.registries.get(registryKey) ?? new Set<string>();
			registry.add(key);
			this.registries.set(registryKey, registry);
		}
		return true;
	}
	fences = new Map<string, Set<string>>();
	async beginFence(key: string, token: string, _leaseMs: number) {
		const tokens = this.fences.get(key) ?? new Set<string>();
		tokens.add(token);
		this.fences.set(key, tokens);
	}
	async hasFence(key: string) {
		return Boolean(this.fences.get(key)?.size);
	}
	async finishFence(generationKey: string, fenceKey: string, token?: string) {
		await this.increment(generationKey);
		if (token) this.fences.get(fenceKey)?.delete(token);
	}
	async delete(key: string) {
		this.data.delete(key);
	}
	async get(key: string) {
		return this.data.get(key) ?? null;
	}
	async increment(key: string) {
		const previous = this.data.get(key) ?? "0";
		const registryKey = `${key}:entries:${previous}`;
		for (const entry of this.registries.get(registryKey) ?? []) this.data.delete(entry);
		this.registries.delete(registryKey);
		const next = Number(previous) + 1;
		this.data.set(key, String(next));
		return next;
	}
	async renewLock(key: string, owner: string, _leaseMs: number) {
		return this.data.get(key) === owner;
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
	override async hasFence(key: string) {
		this.assertAvailable();
		return super.hasFence(key);
	}
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
	test("contended distributed lock falls back without publishing or releasing another owner", async () => {
		const storage = new MemoryCache();
		const cache = new DistributedCache(storage);
		const key = await cache.key("contended", "dashboard", {});
		await storage.set(`${key}:lock`, "other-process");
		const start = performance.now();
		const result = await cache.remember("contended", "dashboard", {}, async () => "fresh");
		expect(result.value).toBe("fresh");
		expect(result.hit).toBeFalse();
		expect(performance.now() - start).toBeLessThan(1000);
		expect(storage.data.get(`${key}:lock`)).toBe("other-process");
		expect(storage.data.has(key)).toBeFalse();
	});

	test("contended reader observes a new generation rather than a retired entry", async () => {
		const storage = new MemoryCache();
		const cache = new DistributedCache(storage);
		const key = await cache.key("contended-generation", "dashboard", {});
		await storage.set(`${key}:lock`, "other-process");
		const pending = cache.remember("contended-generation", "dashboard", {}, async () => "fresh");
		await Bun.sleep(10);
		const token = await cache.beginWrite("contended-generation", ["dashboard"]);
		await cache.finishWrite("contended-generation", ["dashboard"], token);
		await storage.set(key, JSON.stringify({ etag: "old", value: "stale" }));
		expect((await pending).value).toBe("fresh");
		expect(storage.data.get(`${key}:lock`)).toBe("other-process");
	});

	test("a value published during contention avoids fallback", async () => {
		const storage = new MemoryCache();
		const cache = new DistributedCache(storage);
		const key = await cache.key("published", "dashboard", {});
		await storage.set(`${key}:lock`, "other-process");
		let loads = 0;
		const pending = cache.remember("published", "dashboard", {}, async () => ++loads);
		await Bun.sleep(10);
		await storage.set(key, JSON.stringify({ etag: '"published"', value: 42 }));
		expect((await pending).value).toBe(42);
		expect(loads).toBe(0);
	});

	test("a loader finishing after invalidation cannot repopulate the retired generation", async () => {
		const storage = new MemoryCache();
		const cache = new DistributedCache(storage);
		let release!: () => void;
		let started!: () => void;
		const loading = new Promise<void>(resolve => {
			started = resolve;
		});
		const blocked = new Promise<void>(resolve => {
			release = resolve;
		});
		const pending = cache.remember("user", "transactions:detail:purchase", {}, async () => {
			started();
			await blocked;
			return "old";
		});
		await loading;
		const oldKey = await cache.key("user", "transactions:detail:purchase", {});
		const token = await cache.beginWrite("user", ["transactions:detail"]);
		await cache.finishWrite("user", ["transactions:detail"], token);
		release();
		await pending;
		expect(storage.data.has(oldKey)).toBe(false);
		expect((await cache.remember("user", "transactions:detail:purchase", {}, async () => "new")).value).toBe(
			"new",
		);
	});
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
		const token = await cache.beginWrite("user", ["accounts:list"]);
		const duringWrite = await cache.read("user", "accounts:list", {});
		expect(duringWrite).toBeUndefined();
		await cache.finishWrite("user", ["accounts:list"], token);
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
		await Bun.sleep(1010);
		const reconnected = await cache.remember("user", "dashboard", {}, async () => `value-${++loads}`);
		const hit = await cache.remember("user", "dashboard", {}, async () => `value-${++loads}`);
		expect(storage.data.get(cacheKey("cache:epoch"))).toBe("2");
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
		const token = await cache.beginWrite("owner", namespaces);
		expect(await cache.read("owner", "categories:detail", { id: "category" })).toBeUndefined();
		await cache.finishWrite("owner", namespaces, token);
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
		const token = await cache.beginWrite("owner", namespaces);
		await cache.finishWrite("owner", namespaces, token);
		expect(await cache.read("owner", "loans:detail", { id: "loan" })).toBeUndefined();
		expect(await cache.read("owner", "loans:history", { limit: 50, loanId: "loan" })).toBeUndefined();
	});
});

test("schedule mutations fence and invalidate cached transaction details", async () => {
	const cache = new DistributedCache(new MemoryCache());
	await cache.remember("user", "transactions:detail:transaction", {}, async () => "old tags");
	const token = await cache.beginWrite("user", ["transactions:detail"]);
	expect(
		(await cache.remember("user", "transactions:detail:transaction", {}, async () => "new tags")).hit,
	).toBe(false);
	await cache.finishWrite("user", ["transactions:detail"], token);
	expect(
		(await cache.remember("user", "transactions:detail:transaction", {}, async () => "committed tags")).value,
	).toBe("committed tags");
});

test("observes an epoch advanced by another process", async () => {
	const storage = new FlakyCache();
	const first = new DistributedCache(storage);
	const second = new DistributedCache(storage);
	await first.remember("user", "dashboard", {}, async () => "old");
	await second.read("user", "dashboard", {});
	storage.available = false;
	await second.read("user", "dashboard", {});
	storage.available = true;
	await Bun.sleep(1010);
	await second.read("user", "dashboard", {});
	expect(await first.read("user", "dashboard", {})).toBeUndefined();
});

test("one writer and delayed events cannot remove another writer's fence", async () => {
	const cache = new DistributedCache(new MemoryCache());
	const first = await cache.beginWrite("user", ["dashboard"]);
	const second = await cache.beginWrite("user", ["dashboard"]);
	await cache.finishWrite("user", ["dashboard"], first);
	await cache.finishWrite("user", ["dashboard"]);
	await cache.remember("user", "dashboard", {}, async () => "in progress");
	expect(await cache.read("user", "dashboard", {})).toBeUndefined();
	await cache.finishWrite("user", ["dashboard"], second);
	expect((await cache.remember("user", "dashboard", {}, async () => "committed")).value).toBe("committed");
});
