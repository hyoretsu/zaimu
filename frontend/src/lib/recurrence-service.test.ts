import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("advance uses today's date and optional time while preserving scheduled identity and cursor", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("./localStorage");
	const { materializeLocalRecurrences } = await import("./recurrence-service");
	const owner = "guest:recurrence_advance";
	await storage.localRecurrences.put(
		{
			amount: 10,
			createdAt: "2026-10-01T00:00:00Z",
			dayOfMonth: 10,
			destinationFinancialAccountId: "a",
			id: "advance",
			interval: 1,
			isActive: true,
			materializedThrough: "2026-10-02",
			movement: "INCOME",
			name: "Receipt",
			startDate: "2026-10-01",
			unit: "MONTH",
			updatedAt: "2026-10-01T00:00:00Z",
			userId: "guest",
		},
		"advance",
		owner,
	);
	expect(
		await materializeLocalRecurrences(owner, "2026-10-02", undefined, { id: "advance", time: "14:30" }),
	).toBe(1);
	const transaction = (await storage.localTransactions.getAll(owner))[0]!.data;
	expect(transaction.date).toBe("2026-10-02");
	expect(transaction.time).toBe("14:30");
	expect(transaction.recurrenceOccurrenceDate).toBe("2026-10-10");
	expect((await storage.localRecurrences.getById("advance", owner))!.data.materializedThrough).toBe(
		"2026-10-02",
	);
	await expect(
		materializeLocalRecurrences(owner, "2026-10-02", undefined, { id: "advance" }),
	).rejects.toThrow("já foi adiantada");
	expect(await materializeLocalRecurrences(owner, "2026-10-10")).toBe(0);
	expect(await materializeLocalRecurrences(owner, "2026-11-10")).toBe(1);
}, 30000);
