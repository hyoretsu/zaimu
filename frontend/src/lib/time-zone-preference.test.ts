import { expect, setSystemTime, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("guest financial dates and materialization follow saved regional timezone", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("./localStorage");
	const { materializeLocalRecurrences } = await import("./recurrence-service");
	const owner = "guest:time-zone-preference";
	const now = new Date("2026-10-26T03:00:00Z");
	expect(await storage.localFinancialDate(owner, now)).toBe("2026-10-26");
	await storage.localMeta.set("country-preference", "BR", owner);
	expect(await storage.localFinancialDate(owner, now)).toBe("2026-10-26");
	await storage.localMeta.set("time-zone-preference", "America/Rio_Branco", owner);
	expect(await storage.localFinancialDate(owner, now)).toBe("2026-10-25");
	await storage.localAccounts.put(
		{
			balance: 0,
			createdAt: "2026-10-25T00:00:00Z",
			id: "a",
			name: "Account",
			type: "CHECKING",
			updatedAt: "2026-10-25T00:00:00Z",
			userId: "guest",
		},
		"a",
		owner,
	);
	await storage.localRecurrences.put(
		{
			amount: 10,
			createdAt: "2026-10-25T00:00:00Z",
			currency: "BRL",
			id: "timezone-recurrence",
			interval: 1,
			isActive: true,
			materializedThrough: "2026-10-25",
			movement: "EXPENSE",
			name: "Regional recurrence",
			originFinancialAccountId: "a",
			startDate: "2026-10-26",
			tagIds: [],
			tags: [],
			unit: "MONTH",
			updatedAt: "2026-10-25T00:00:00Z",
			userId: "guest",
		},
		"timezone-recurrence",
		owner,
	);
	try {
		setSystemTime(now);
		expect(await materializeLocalRecurrences(owner)).toBe(0);
		setSystemTime(new Date("2026-10-26T05:00:00Z"));
		expect(await materializeLocalRecurrences(owner)).toBe(1);
		expect(await materializeLocalRecurrences(owner)).toBe(0);
		await storage.localMeta.set("time-zone-preference", null, owner);
		expect(await storage.localFinancialDate(owner, now)).toBe("2026-10-26");
	} finally {
		setSystemTime();
	}
});
