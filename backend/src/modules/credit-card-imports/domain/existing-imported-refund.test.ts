import { expect, test } from "bun:test";
import {
	addBookRefund,
	type CreditBook,
	creditBookEntries,
	newBookPurchase,
	removeBookRefund,
} from "@zaimu/finance/credit-book";
import { approveImportedRefund, existingImportedRefund } from "./existing-imported-refund";

function newBook(): CreditBook {
	return {
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
}

test("explicit import review reuses manual refund, cancels exact tail and preserves identity on repeat", () => {
	const book = newBook();
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

test("bank identity takes precedence over an identical manual partial refund", () => {
	const book = newBook();
	const purchase = newBookPurchase(book, {
		description: "Purchase",
		installments: 1,
		purchaseDate: "2026-08-01",
		totalAmount: 200,
	});
	const input = { amount: 47.26, creditDate: "2026-08-28", externalId: "bank-partial-refund" };
	const approved = approveImportedRefund(book, purchase.id, input);
	addBookRefund(book, purchase.id, input);
	expect(approveImportedRefund(book, purchase.id, input).id).toBe(approved.id);
	expect(book.refunds).toHaveLength(2);
});

test("conflicting active bank identities cannot create another partial refund", () => {
	const book = newBook();
	const purchase = newBookPurchase(book, {
		description: "Purchase",
		installments: 1,
		purchaseDate: "2026-08-01",
		totalAmount: 200,
	});
	const other = newBookPurchase(book, {
		description: "Other",
		installments: 1,
		purchaseDate: "2026-08-01",
		totalAmount: 200,
	});
	const input = { amount: 47.26, creditDate: "2026-08-28", externalId: "bank-partial-refund" };
	approveImportedRefund(book, purchase.id, input);
	for (const changes of [{ amount: 7.3 }, { creditDate: "2026-08-29" }]) {
		expect(() => approveImportedRefund(book, purchase.id, { ...input, ...changes })).toThrow(
			"já está vinculado",
		);
	}
	expect(existingImportedRefund(book.refunds, other.id, input)).toBeUndefined();
	expect(() => approveImportedRefund(book, other.id, input)).toThrow("já está vinculado");

	expect(book.refunds).toHaveLength(1);
});

test("deleted refund does not block a new explicit import approval", () => {
	const book = newBook();
	const purchase = newBookPurchase(book, {
		description: "Purchase",
		installments: 1,
		purchaseDate: "2026-08-01",
		totalAmount: 200,
	});
	const input = { amount: 47.26, creditDate: "2026-08-28", externalId: "bank-partial-refund" };
	const original = approveImportedRefund(book, purchase.id, input);
	const createdAt = original.createdAt;
	removeBookRefund(book, purchase.id, original.id);
	expect(creditBookEntries(book).some(entry => entry.id === original.id)).toBe(false);
	const restored = approveImportedRefund(book, purchase.id, input);
	expect(restored.id).not.toBe(original.id);
	expect(original.createdAt).toBe(createdAt);
	expect(restored.deletedAt).toBeNull();
	expect(book.refunds.filter(refund => !refund.deletedAt)).toHaveLength(1);
	expect(creditBookEntries(book).find(entry => entry.id === restored.id)?.installmentAmount).toBe(-47.26);
	expect(approveImportedRefund(book, purchase.id, input).id).toBe(restored.id);
	expect(book.refunds.filter(refund => !refund.deletedAt)).toHaveLength(1);
});

test("new approval after deletion revalidates remaining refundable balance", () => {
	const book = newBook();
	const purchase = newBookPurchase(book, {
		description: "Purchase",
		installments: 1,
		purchaseDate: "2026-08-01",
		totalAmount: 50,
	});
	const input = { amount: 47.26, creditDate: "2026-08-28", externalId: "bank-partial-refund" };
	const original = approveImportedRefund(book, purchase.id, input);
	removeBookRefund(book, purchase.id, original.id);
	addBookRefund(book, purchase.id, { amount: 10, creditDate: "2026-08-28" });
	expect(() => approveImportedRefund(book, purchase.id, input)).toThrow("saldo disponível");
	expect(original.deletedAt).not.toBeNull();
	expect(original.externalId).toBe(input.externalId);
	expect(book.refunds).toHaveLength(2);
});
