import { expect, test } from "bun:test";
import { changeBookCalendar, creditBookPlan, newBookPurchase } from "@zaimu/finance/credit-book";
import { normalizeCardCalendar, previewCalendarTransition } from "@zaimu/finance/credit-card";
import { IDBFactory } from "fake-indexeddb";
import type { CreditCard, FinancialAccount } from "../api";

test("guest storage retains calendar history and both October installments after reload", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("../localStorage");
	const owner = "guest:calendar_test" as const;
	const card = {
		creditLimit: 1000,
		currentStatement: null,
		dueDay: 8,
		financialAccountId: "calendar-account",
		id: "calendar-card",
		statementDay: 1,
		workingDueDate: true,
	} as CreditCard;
	const account = {
		creditCard: card,
		currency: "BRL",
		id: "calendar-account",
		institutionId: null,
		type: "CREDIT_CARD",
		userId: "calendar_test",
	} as FinancialAccount;
	await storage.localAccounts.put(account, account.id, owner);
	await storage.localCreditCards.put(card, card.id, owner);
	await storage.mutateLocalCreditBook(
		card.id,
		book => {
			newBookPurchase(
				book,
				{ description: "Purchase", installments: 3, purchaseDate: "2024-09-15", totalAmount: 90 },
				undefined,
				{ materialize: false },
			);
		},
		owner,
		undefined,
		"2024-09-15",
	);
	await storage.localCreditCards.put({ ...card, dueDay: 24, statementDay: 17 }, card.id, owner);
	const period = previewCalendarTransition(
		normalizeCardCalendar(card),
		{ dueDay: 24, statementDay: 17, workingDueDate: true },
		"2024-10-02",
		"EXTRA_CYCLE",
		"PER_CYCLE",
	);
	await storage.mutateLocalCreditBook(
		card.id,
		book => changeBookCalendar(book, card, period),
		owner,
		undefined,
		"2024-10-17",
	);
	const reloaded = await storage.readLocalCreditBook(card.id, owner);
	const plan = creditBookPlan(reloaded);
	expect(
		plan.installments.map(item => plan.statements.find(s => s.id === item.statementId)!.dueDate),
	).toEqual(["2024-10-08", "2024-10-24", "2024-11-25"]);
	expect((await storage.localCreditCards.getById(card.id, owner))?.data.calendarHistory).toHaveLength(2);
	expect(
		(await storage.localAccounts.getById(account.id, owner))?.data.creditCard?.calendarHistory,
	).toHaveLength(2);
}, 60000);
