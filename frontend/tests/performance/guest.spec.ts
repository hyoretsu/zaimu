import { expect, test } from "@playwright/test";

test("offline guest navigation and IndexedDB fixture reads retain identity isolation", async ({
	page,
	baseURL,
}, testInfo) => {
	await page.routeWebSocket("**", socket => socket.close());
	await page.route("**/*", route => {
		if (new URL(route.request().url()).origin === baseURL) return route.continue();
		return route.abort("blockedbyclient");
	});
	await page.addInitScript(() =>
		localStorage.setItem(
			"zaimu-auth",
			JSON.stringify({ state: { guestId: "guest_performance", isGuestMode: true }, version: 0 }),
		),
	);
	await page.clock.setFixedTime(new Date("2026-10-04T12:00:00-03:00"));
	await page.goto("/settings");
	await expect(page.getByRole("heading", { exact: true, name: "Ajustes" })).toBeVisible();
	const samples: { size: number; writeMs: number; readMs: number; ownCount: number; otherCount: number }[] =
		[];
	for (const size of [10, 10000, 100000]) {
		const result = await page.evaluate(async count => {
			const database = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open("zaimu-local");
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const started = performance.now();
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction("scoped-transactions", "readwrite");
				const store = transaction.objectStore("scoped-transactions");
				store.clear();
				for (let index = 0; index < count; index++) {
					const id = `performance-${index}`;
					store.put({
						data: { amount: 1, date: "2026-10-04", description: id, id, type: "EXPENSE" },
						localId: id,
						modifiedAt: 1,
						ownerKey: "guest:guest_performance",
						scopedId: `guest:guest_performance\u0000${id}`,
					});
				}
				store.put({
					data: { id: "other" },
					localId: "other",
					modifiedAt: 1,
					ownerKey: "guest:other",
					scopedId: "guest:other\u0000other",
				});
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
			});
			const writeMs = performance.now() - started;
			const readAt = performance.now();
			const read = (owner: string) =>
				new Promise<unknown[]>((resolve, reject) => {
					const request = database
						.transaction("scoped-transactions")
						.objectStore("scoped-transactions")
						.index("ownerKey")
						.getAll(owner);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
			const [own, other] = await Promise.all([read("guest:guest_performance"), read("guest:other")]);
			const readMs = performance.now() - readAt;
			database.close();
			return { otherCount: other.length, ownCount: own.length, readMs, writeMs };
		}, size);
		samples.push({ size, ...result });
		expect(result.ownCount).toBe(size);
		expect(result.otherCount).toBe(1);
	}
	await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open("zaimu-local");
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction("scoped-transactions", "readwrite");
			transaction.objectStore("scoped-transactions").clear();
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		db.close();
	});
	await page.goto("/transactions");
	await expect(page.getByRole("heading", { exact: true, name: "Transações" })).toBeVisible();
	await expect(page.locator(".animate-pulse")).toHaveCount(0);
	await testInfo.attach("guest-storage-performance", {
		body: JSON.stringify({ diagnostic: true, globalAcceptance: false, samples }, null, 2),
		contentType: "application/json",
	});
	for (const sample of samples) expect(sample.readMs).toBeLessThan(1000);
});
