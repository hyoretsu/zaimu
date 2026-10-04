import { expect, test } from "bun:test";
import { type CreditBook, newBookPurchase, replayCreditBook } from "./credit-book";
import { pendingStatementPayments } from "./payment-suggestions";

function book(): CreditBook {
	return {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "owner",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
}

test("suggests carried overdue debt only when the receiving cycle closes", () => {
	const ledger = book();
	newBookPurchase(ledger, {
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-08-10",
		totalAmount: 100,
	});
	newBookPurchase(ledger, {
		description: "Compra do próximo ciclo",
		installments: 1,
		purchaseDate: "2026-09-10",
		totalAmount: 25,
	});
	expect(pendingStatementPayments(ledger, "2026-08-19")).toEqual([]);
	expect(pendingStatementPayments(ledger, "2026-08-20").map(row => row.amount)).toEqual([100]);
	expect(pendingStatementPayments(ledger, "2026-08-28")[0]).toMatchObject({
		amount: 100,
		dueDate: "2026-08-28",
	});
	expect(pendingStatementPayments(ledger, "2026-08-29")).toEqual([]);
	expect(pendingStatementPayments(ledger, "2026-09-03")).toEqual([]);
	expect(pendingStatementPayments(ledger, "2026-09-20")).toHaveLength(1);
	expect(pendingStatementPayments(ledger, "2026-09-20")[0]).toMatchObject({
		amount: 125,
		dueDate: "2026-09-28",
	});
});

test("partial payment, final payment and cutoff remove or reduce suggestion", () => {
	const ledger = book();
	newBookPurchase(ledger, {
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-08-10",
		totalAmount: 100,
	});
	ledger.payments.push({ amount: 40, date: "2026-08-25", id: "partial" });
	expect(pendingStatementPayments(ledger, "2026-08-26")[0].amount).toBe(60);
	ledger.payments.push({ amount: 60, date: "2026-08-26", id: "final" });
	expect(pendingStatementPayments(ledger, "2026-08-26")).toEqual([]);
	ledger.payments = [];
	ledger.card.ignoreStatementsBefore = "2026-08-21";
	expect(pendingStatementPayments(ledger, "2026-08-26")).toEqual([]);
});

test("scheduled payments reduce suggestions and deletion restores them without changing current balances", () => {
	const ledger = book();
	newBookPurchase(ledger, {
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-08-10",
		totalAmount: 100,
	});
	const today = "2026-08-26";
	const original = pendingStatementPayments(ledger, today);
	ledger.payments.push({ amount: 40, date: "2026-08-28", id: "partial" });
	expect(pendingStatementPayments(ledger, today)[0].amount).toBe(60);
	ledger.payments.push({ amount: 60, date: "2026-08-28", id: "final" });
	expect(pendingStatementPayments(ledger, today)).toEqual([]);
	expect(
		replayCreditBook(ledger, today).statements.find(row => row.id === original[0].statementId)
			?.balanceAmount,
	).toBe(100);
	expect(ledger.payments[0].date).toBe("2026-08-28");
	ledger.payments = [];
	expect(pendingStatementPayments(ledger, today)).toEqual(original);
});
