import { expect, test } from "bun:test";
import { addBookRefund, materializeBookInstallments, newBookPurchase } from "@zaimu/finance/credit-book";
import { IDBFactory } from "fake-indexeddb";
import type { Recurrence } from "./recurrence";

test("guest association keeps transaction identity through past edits, replay and deletion", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("./localStorage");
	const { associateLocalRecurrence } = await import("./associate-recurrence");
	const { materializeLocalRecurrences } = await import("./recurrence-service");
	const owner = "guest:associate-transaction";
	const recurrence: Recurrence = {
		amount: 10,
		createdAt: "2026-10-01",
		dayOfMonth: 1,
		id: "r",
		interval: 1,
		isActive: true,
		materializedThrough: "2026-10-02",
		movement: "EXPENSE",
		name: "Rent",
		originFinancialAccountId: "a",
		startDate: "2026-10-01",
		unit: "MONTH",
		updatedAt: "2026-10-01",
		userId: "guest",
	};
	await storage.localRecurrences.put(recurrence, recurrence.id, owner);
	const transaction = {
		amount: 25,
		createdAt: "2026-10-01",
		date: "2026-10-02",
		externalIds: ["bank-reference"],
		id: "original",
		originFinancialAccountId: "a",
		type: "EXPENSE" as const,
	};
	await storage.localTransactions.put(transaction, transaction.id, owner);
	const input = { date: "2026-10-01", kind: "TRANSACTION" as const, recordId: transaction.id };
	await associateLocalRecurrence(owner, recurrence.id, input);
	await associateLocalRecurrence(owner, recurrence.id, { ...input, date: "2026-10-20" });
	await storage.localRecurrences.put(
		{ ...recurrence, amount: 99, dayOfMonth: 2, name: "Edited", startDate: "2026-09-30" },
		recurrence.id,
		owner,
	);
	expect(
		await materializeLocalRecurrences(owner, "2026-10-02", {
			from: "2026-10-01",
			id: "r",
			through: "2026-10-02",
		}),
	).toBe(0);
	const transactions = await storage.localTransactions.getAll(owner);
	expect(transactions).toHaveLength(1);
	expect(transactions[0]!.data).toEqual({
		...transaction,
		recurrenceId: "r",
		recurrenceOccurrenceDate: "2026-10-01",
	});
	await storage.localTransactions.put({ ...transaction, id: "other" }, "other", owner);
	await expect(associateLocalRecurrence(owner, "r", { ...input, recordId: "other" })).rejects.toThrow(
		"processad",
	);
	expect((await storage.localTransactions.getById("other", owner))!.data.recurrenceId).toBeUndefined();
	await storage.localTransactions.delete("original", owner);
	await expect(associateLocalRecurrence(owner, "r", { ...input, recordId: "other" })).rejects.toThrow(
		"processad",
	);
}, 30000);

test("guest purchase association retains installment, refund and import identities on replay", async () => {
	const storage = await import("./localStorage");
	const { associateLocalRecurrence } = await import("./associate-recurrence");
	const { materializeLocalRecurrences } = await import("./recurrence-service");
	const owner = "guest:associate-purchase";
	const card = {
		accountName: "Cartão",
		creditLimit: 1000,
		currentStatement: null,
		dueDay: 28,
		excludeFromTotals: false,
		financialAccountId: "card-account",
		id: "card",
		limit: { availableLimit: 1000, effectiveLimit: 1000, temporaryCredit: 0, usedLimit: 0 },
		statementDay: 20,
		workingDueDate: false,
	};
	await storage.localCreditCards.put(card, card.id, owner);
	const book = await storage.readLocalCreditBook(card.id, owner);
	const purchase = newBookPurchase(
		book,
		{
			description: "Existing purchase",
			externalId: "bank-purchase",
			installments: 3,
			purchaseDate: "2026-10-01",
			totalAmount: 90,
		},
		undefined,
		{ materialize: false },
	);
	materializeBookInstallments(book, "2026-10-10");
	addBookRefund(book, purchase.id, { amount: 10, creditDate: "2026-10-02", policy: "KEEP_INSTALLMENTS" });
	await storage.localCreditBooks.put(book, card.id, owner);
	const recurrence: Recurrence = {
		amount: 90,
		createdAt: "2026-10-01",
		creditCardId: card.id,
		id: "p",
		installments: 3,
		interval: 1,
		isActive: true,
		materializedThrough: "2026-10-01",
		movement: "CARD_PURCHASE",
		name: "Subscription",
		startDate: "2026-10-01",
		unit: "MONTH",
		updatedAt: "2026-10-01",
		userId: "guest",
	};
	await storage.localRecurrences.put(recurrence, recurrence.id, owner);
	const before = structuredClone(book);
	await associateLocalRecurrence(owner, "p", {
		date: "2026-10-01",
		kind: "PURCHASE",
		recordId: purchase.id,
	});
	await storage.localRecurrences.put({ ...recurrence, amount: 120 }, "p", owner);
	expect(
		await materializeLocalRecurrences(owner, "2026-10-01", {
			from: "2026-10-01",
			id: "p",
			through: "2026-10-01",
		}),
	).toBe(0);
	const saved = (await storage.localCreditBooks.getById(card.id, owner))!.data;
	expect(saved).toEqual({
		...before,
		purchases: [{ ...before.purchases[0]!, recurrenceId: "p", recurrenceOccurrenceDate: "2026-10-01" }],
	});
}, 30000);

test("concurrent guest links cannot attach one transaction to two recurrences", async () => {
	const storage = await import("./localStorage");
	const { associateLocalRecurrence } = await import("./associate-recurrence");
	const owner = "guest:associate-concurrent";
	const recurrence: Recurrence = {
		amount: 10,
		createdAt: "2026-10-01",
		destinationFinancialAccountId: "a",
		id: "first",
		interval: 1,
		isActive: true,
		materializedThrough: "2026-10-01",
		movement: "INCOME",
		name: "Rent",
		startDate: "2026-10-01",
		unit: "DAY",
		updatedAt: "2026-10-01",
		userId: "guest",
	};
	for (const id of ["first", "second"])
		await storage.localRecurrences.put({ ...recurrence, id }, id, owner);
	await storage.localTransactions.put(
		{
			amount: 10,
			createdAt: "2026-10-01",
			date: "2026-10-01",
			destinationFinancialAccountId: "a",
			id: "original",
			type: "INCOME",
		},
		"original",
		owner,
	);
	const results = await Promise.allSettled(
		["first", "second"].map(id =>
			associateLocalRecurrence(owner, id, {
				date: "2026-10-01",
				kind: "TRANSACTION",
				recordId: "original",
			}),
		),
	);
	expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
	expect(await storage.localRecurrenceOccurrences.getAll(owner)).toHaveLength(1);
});
