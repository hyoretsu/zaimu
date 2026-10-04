import { describe, expect, test } from "bun:test";
import { AuthSecondaryStorage } from "./secondary-storage";

const url = process.env.CACHE_TEST_REDIS_URL;
const suite = url ? describe : describe.skip;
suite("auth cache generations", () => {
	test("prevents stale fallback repopulation and shares revocation between instances", async () => {
		const target = new URL(url!);
		if (target.hostname !== "127.0.0.1" || target.port !== "6395")
			throw new Error("Dedicated local Redis required");
		const first = new AuthSecondaryStorage(url);
		const peer = new AuthSecondaryStorage(url);
		await first.client.connect();
		await peer.client.connect();
		const token = `test-session-${crypto.randomUUID()}`;
		try {
			await first.run(async () => first.set(token, "old", 60));
			expect(await peer.run(() => peer.get(token))).toBe("old");
			await first.run(async () => {
				expect(await first.get(token)).toBe("old");
				await peer.mutate(async () => {});
				await first.set(token, "stale", 60);
			});
			expect(await peer.run(() => peer.get(token))).toBeNull();
			await first.run(() => first.set(token, "new", 60));
			expect(await peer.run(() => peer.get(token))).toBe("new");
			await first.delete(token);
		} finally {
			first.client.close();
			peer.client.close();
		}
	});
	test("releases a completed mutation after exhausting its request Redis budget", async () => {
		const { withQueryMetrics, getQueryMetrics } = await import("sql");
		const storage = new AuthSecondaryStorage(url);
		await storage.client.connect();
		const token = `cleanup-${crypto.randomUUID()}`;
		try {
			await withQueryMetrics(() =>
				storage.mutate(async () => {
					getQueryMetrics()!.redisWaitMs = 100;
				}),
			);
			expect(await storage.run(() => storage.get(token))).toBeNull();
			await Bun.sleep(1200);
			await storage.run(() => storage.set(token, "recovered", 60));
			expect(await storage.run(() => storage.get(token))).toBe("recovered");
			const increment = storage.increment;
			expect(await increment(`count-${token}`, 60)).toBe(1);
			expect(await increment(`count-${token}`, 60)).toBe(2);
			await storage.delete(token);
		} finally {
			storage.client.close();
		}
	});

	test("partitioned mutation fails before authoritative writes", async () => {
		const storage = new AuthSecondaryStorage("redis://127.0.0.1:6396");
		let revoked = false;
		try {
			const start = performance.now();
			await expect(
				storage.mutate(async () => {
					revoked = true;
				}),
			).rejects.toThrow("temporariamente indisponível");
			expect(revoked).toBe(false);
			expect(performance.now() - start).toBeLessThan(250);
			expect(await storage.run(() => storage.get("revoked"))).toBeNull();
		} finally {
			storage.client.close();
		}
	});
});
