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

test("guest subscriptions create one installment plan per renewal without future concrete installments", async () => {
	const storage = await import("./localStorage");
	const { materializeLocalRecurrences } = await import("./recurrence-service");
	const owner = "guest:subscription_installments";
	const card = {
		accountName: "Cartão",
		creditLimit: 1000,
		currentStatement: null,
		dueDay: 28,
		excludeFromTotals: false,
		financialAccountId: "subscription-card-account",
		id: "subscription-card",
		limit: { availableLimit: 1000, effectiveLimit: 1000, temporaryCredit: 0, usedLimit: 0 },
		statementDay: 20,
		workingDueDate: false,
	};
	await storage.localCreditCards.put(card, card.id, owner);
	await storage.localRecurrences.put(
		{
			amount: 57,
			createdAt: "2026-04-01T00:00:00Z",
			creditCardId: card.id,
			id: "subscription",
			installments: 3,
			interval: 1,
			isActive: true,
			materializedThrough: "2026-03-31",
			movement: "CARD_PURCHASE",
			name: "Clube",
			startDate: "2026-04-01",
			unit: "YEAR",
			updatedAt: "2026-04-01T00:00:00Z",
			userId: "guest",
		},
		"subscription",
		owner,
	);
	expect(await materializeLocalRecurrences(owner, "2026-04-01")).toBe(1);
	expect(await materializeLocalRecurrences(owner, "2026-04-01")).toBe(0);
	const first = await storage.readLocalCreditBook(card.id, owner);
	expect(first.purchases).toHaveLength(1);
	expect(first.purchases[0]!.installmentAmountsCents).toHaveLength(3);
	expect(first.purchases[0]!.totalAmountCents).toBe(5700);
	expect(first.installments).toHaveLength(1);
	expect(first.installments[0]!.amountCents).toBe(1900);
	expect(await materializeLocalRecurrences(owner, "2027-04-01")).toBe(1);
	const renewed = await storage.readLocalCreditBook(card.id, owner);
	expect(renewed.purchases).toHaveLength(2);
	expect(renewed.purchases.every(purchase => purchase.installmentAmountsCents.length === 3)).toBe(true);
	expect(renewed.installments.filter(item => item.occurrenceDate > "2027-04-01")).toEqual([]);
});
