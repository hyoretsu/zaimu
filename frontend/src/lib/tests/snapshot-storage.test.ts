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
	const storage = await import("../localStorage");
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
