import { expect, test } from "bun:test";
import {
	addBookRefund,
	type CreditBook,
	creditBookEntries,
	newBookPurchase,
} from "@zaimu/finance/credit-book";
import { approveImportedRefund, existingImportedRefund } from "./existing-imported-refund";

test("explicit import review reuses manual refund, cancels exact tail and preserves identity on repeat", () => {
	const book: CreditBook = {
		card: {
			dueDay: 21,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 15,
			userId: "owner",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	const purchase = newBookPurchase(book, {
		description: "Riser",
		installments: 8,
		purchaseDate: "2026-08-08",
		totalAmount: 249,
	});
	purchase.installmentAmountsCents = [3116, ...Array(7).fill(3112)];
	const manual = addBookRefund(book, purchase.id, {
		amount: 249,
		creditDate: "2026-09-04",
		policy: "KEEP_INSTALLMENTS",
	});
	const input = {
		amount: 249,
		canceledInstallmentNumbers: [2, 3, 4, 5, 6, 7, 8],
		creditDate: "2026-09-04",
		externalId: "bank-refund",
	};
	expect(existingImportedRefund(book.refunds, purchase.id, { ...input, amount: 248.99 })).toBeUndefined();
	const approved = approveImportedRefund(book, purchase.id, input);
	expect(approved.id).toBe(manual.id);
	expect(book.refunds).toHaveLength(1);
	expect(approved.externalId).toBe("bank-refund");
	expect(approved.policy).toBe("CANCEL_FUTURE_INSTALLMENTS");
	expect(creditBookEntries(book).find(row => row.id === manual.id)?.installmentAmount).toBe(-31.16);
	expect(creditBookEntries(book).filter(row => row.isReimbursed)).toHaveLength(7);
	expect(approveImportedRefund(book, purchase.id, input).id).toBe(manual.id);
	expect(
		existingImportedRefund(book.refunds, purchase.id, { ...input, externalId: "different-bank-credit" }),
	).toBeUndefined();
});
