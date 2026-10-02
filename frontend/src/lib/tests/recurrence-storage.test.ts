import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("local occurrence commits atomically, retries once and deletion keeps marker", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("../localStorage");
	const { materializeLocalRecurrences } = await import("../recurrence-service");
	const owner = "guest:recurrence_test";
	const r = {
		amount: 10,
		createdAt: "2026-10-01T00:00:00Z",
		destinationFinancialAccountId: "a",
		id: "r",
		interval: 1,
		isActive: true,
		materializedThrough: "2026-09-30",
		movement: "INCOME" as const,
		name: "Receipt",
		startDate: "2026-10-01",
		unit: "DAY" as const,
		updatedAt: "2026-10-01T00:00:00Z",
		userId: "guest",
	};
	await storage.localRecurrences.put(r, "r", owner);
	expect(await materializeLocalRecurrences(owner, "2026-10-01")).toBe(1);
	expect(await materializeLocalRecurrences(owner, "2026-10-01")).toBe(0);
	const transaction = (await storage.localTransactions.getAll(owner))[0]!;
	await storage.localTransactions.delete(transaction.data.id, owner);
	expect((await storage.localRecurrenceOccurrences.getAll(owner))[0]!.data.deletedAt).toBeTruthy();
	expect(
		await materializeLocalRecurrences(owner, "2026-10-01", {
			from: "2026-10-01",
			id: "r",
			through: "2026-10-01",
		}),
	).toBe(0);
	const expected = (await storage.localRecurrences.getById("r", owner))!;
	await storage.localRecurrences.put({ ...r, name: "Changed" }, "r", owner);
	await expect(
		storage.commitLocalRecurrenceChanges(
			owner,
			expected,
			r,
			[{ date: "2026-10-02", id: "r:2026-10-02", recurrenceId: "r" }],
			[],
		),
	).rejects.toThrow("mudou");
	expect(await storage.localRecurrenceOccurrences.getAll(owner)).toHaveLength(1);
}, 30000);

test("sync preserves edits made after request started", async () => {
	const s = await import("../localStorage");
	const owner = "user:recurrence_ack";
	const r = {
		amount: 10,
		createdAt: "2026-10-01T00:00:00Z",
		destinationFinancialAccountId: "a",
		id: "old",
		interval: 1,
		isActive: true,
		materializedThrough: "2026-09-30",
		movement: "INCOME" as const,
		name: "Receipt",
		startDate: "2026-10-01",
		unit: "MONTH" as const,
		updatedAt: "2026-10-01T00:00:00Z",
		userId: "recurrence_ack",
	};
	await s.localRecurrences.put(r, "old", owner);
	const sent = await s.localRecurrences.getAll(owner);
	await s.localRecurrences.put({ ...r, name: "Newer local edit" }, "old", owner);
	await s.localTransactions.put(
		{
			amount: 10,
			createdAt: r.createdAt,
			date: "2026-10-01",
			id: "linked",
			recurrenceId: "old",
			recurrenceOccurrenceDate: "2026-10-01",
			type: "INCOME",
		},
		"linked",
		owner,
	);
	await s.acknowledgeRecurrenceSync(sent, [{ ...r, id: "old" }], [], [], owner);
	expect((await s.localRecurrences.getById("old", owner))!.data.name).toBe("Newer local edit");
	expect((await s.localTransactions.getById("linked", owner))!.data.recurrenceId).toBe("old");
	const current = await s.localRecurrences.getAll(owner);
	await s.acknowledgeRecurrenceSync(
		current,
		current.map(row => row.data),
		[],
		[],
		owner,
	);
	expect(await s.localRecurrences.getAll(owner)).toHaveLength(1);
	const acknowledged = (await s.localRecurrences.getById("old", owner))!;
	expect(acknowledged.modifiedAt).toBe(acknowledged.syncedAt!);
	await s.deleteLocalRecurrence(owner, "old", false);
	expect(await s.localRecurrences.getAll(owner)).toHaveLength(0);
	expect((await s.localTransactions.getById("linked", owner))!.data.recurrenceId).toBeUndefined();
});
