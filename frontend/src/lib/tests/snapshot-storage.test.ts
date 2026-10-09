import { expect, test } from "bun:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

test("snapshot batches preserve concurrent edits, tombstones and owner isolation", async () => {
	if (typeof indexedDB === "undefined")
		Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
	// A completed v15 database must receive only the index upgrade.
	const previous = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open("zaimu-local", 15);
		request.onupgradeneeded = () => {
			request.result
				.createObjectStore("application-upgrade", { keyPath: "id" })
				.put({ id: "state", status: "complete", version: 13 });
			const store = request.result.createObjectStore("scoped-transactions", { keyPath: "scopedId" });
			for (const index of ["ownerKey", "syncedAt", "modifiedAt", "deleted"]) store.createIndex(index, index);
			store.createIndex("ownerModifiedAt", ["ownerKey", "modifiedAt"]);
			store.put({
				data: { id: "preserved" },
				localId: "preserved",
				modifiedAt: 1000,
				ownerKey: "user:preserved",
				scopedId: "user:preserved\u0000preserved",
			});
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	previous.close();
	const storage = await import("../localStorage");
	const upgraded = await storage.initLocalDb();
	expect(upgraded.version).toBe(16);
	const indexes = upgraded.transaction("scoped-transactions").objectStore("scoped-transactions").indexNames;
	for (const retired of ["syncedAt", "modifiedAt", "deleted"]) expect(indexes.contains(retired)).toBe(false);
	expect(indexes.contains("ownerModifiedAt")).toBe(true);
	expect(await storage.getById("transactions", "preserved", "user:preserved")).toBeDefined();
	expect(await storage.getModifiedSince("transactions", 1000, "user:preserved")).toHaveLength(0);
	expect(await storage.getModifiedSince("transactions", 999, "user:preserved")).toHaveLength(1);
	const owner = "guest:snapshot-test" as const;
	const other = "user:snapshot-other" as const;
	const items = Array.from({ length: 2100 }, (_, index) => ({
		data: { date: "2026-10-04", id: String(index), title: "Remote" },
		localId: String(index),
		syncedAt: 1000,
	}));
	await storage.replaceRemoteSnapshot("transactions", items, owner);
	await storage.put("transactions", { ...items[0].data, title: "Edited" }, "0", owner);
	await storage.softDelete("transactions", "1", owner);
	await storage.replaceRemoteSnapshot("transactions", items.slice(0, -1), owner);
	expect((await storage.getById<{ title: string }>("transactions", "0", owner))?.data.title).toBe("Edited");
	expect(await storage.getById("transactions", "1", owner)).toBeUndefined();
	expect(await storage.getById("transactions", "2099", owner)).toBeUndefined();
	expect(await storage.getAll("transactions", other)).toHaveLength(0);
	expect(await storage.getModifiedSince("transactions", 1000, owner)).toHaveLength(1);
	const db = await storage.initLocalDb();
	expect(
		db.transaction("scoped-transactions").objectStore("scoped-transactions").indexNames.contains("ownerDate"),
	).toBe(true);
}, 30000);
