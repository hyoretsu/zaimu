import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("event acknowledgement preserves concurrent edits and deleted origins", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("../localStorage");
	const owner = "user:debt-ack";
	const event = {
		amount: 12,
		createdAt: "2026-10-01T00:00:00Z",
		date: null,
		debtPersonId: "person",
		effect: 12,
		id: "origin",
		kind: "ORIGIN" as const,
		updatedAt: "2026-10-01T00:00:00Z",
	};
	await storage.createLocalDebtOrigins([event], owner);
	const sent = await storage.localDebtEvents.getAllWithTombstones(owner);
	await storage.localDebtEvents.put({ ...event, amount: 20, effect: 20 }, event.id, owner);
	await storage.acknowledgeDebtEventSync(sent, [event], owner);
	expect((await storage.localDebtEvents.getById(event.id, owner))!.data.amount).toBe(20);
	await storage.localDebtEvents.delete(event.id, owner);
	const deleted = await storage.localDebtEvents.getAllWithTombstones(owner);
	expect(deleted[0]!.deleted).toBe(true);
	expect(await storage.localDebtEvents.getAll(owner)).toHaveLength(0);
	await storage.acknowledgeDebtEventSync(deleted, [{ ...event, deletedAt: "2026-10-02T00:00:00Z" }], owner);
	expect((await storage.localDebtEvents.getAllWithTombstones(owner))[0]!.deleted).toBe(true);
	expect(await storage.localDebtEvents.getAll("user:other")).toHaveLength(0);
});
