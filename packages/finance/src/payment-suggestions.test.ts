import { expect, test } from "bun:test";
import { type CreditBook, newBookPurchase } from "./credit-book";
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

test("suggests only after closing and retains overdue debt once", () => {
	const ledger = book();
	newBookPurchase(ledger, {
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-08-10",
		totalAmount: 100,
	});
	expect(pendingStatementPayments(ledger, "2026-08-19")).toEqual([]);
	expect(pendingStatementPayments(ledger, "2026-08-20").map(row => row.amount)).toEqual([100]);
	expect(pendingStatementPayments(ledger, "2026-09-03").reduce((sum, row) => sum + row.amount, 0)).toBe(
		100,
	);
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
