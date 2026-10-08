import { describe, expect, test } from "bun:test";
import { requireFixtureUrl } from "../../../../scripts/testing/fixture";
import { AuthSecondaryStorage } from "./secondary-storage";

const url = requireFixtureUrl("CACHE_TEST_REDIS_URL");
const suite = describe;
suite("auth cache generations", () => {
	test("prevents stale fallback repopulation and shares revocation between instances", async () => {
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
		const storage = new AuthSecondaryStorage(requireFixtureUrl("UNAVAILABLE_REDIS_TEST_URL"));
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
