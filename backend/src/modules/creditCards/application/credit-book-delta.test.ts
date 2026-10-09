import { describe, expect, test } from "bun:test";
import { type CreditBook, newBookPurchase } from "@zaimu/finance/credit-book";
import { creditBookDelta } from "./credit-book-delta";

const fixture = (size: number): CreditBook => {
	const book: CreditBook = {
		card: {
			currency: "BRL",
			dueDay: 5,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 25,
			userId: "user",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	const template = newBookPurchase(book, {
		description: "Original",
		id: "template",
		installments: 12,
		purchaseDate: "2026-01-10",
		totalAmount: 100.01,
	});
	book.purchases = Array.from({ length: size }, (_, index) => ({
		...structuredClone(template),
		id: `purchase-${index}`,
	}));
	book.installments = [];
	return book;
};

describe("credit book persistence work", () => {
	for (const size of [10, 1000, 10000]) {
		test(`single edit changes one purchase with ${size} historical records`, () => {
			const previous = fixture(size);
			const next = structuredClone(previous);
			next.purchases[0]!.description = "Updated";
			const delta = creditBookDelta(next, previous);
			expect(delta.purchases.map(p => p.id)).toEqual(["purchase-0"]);
			expect(delta.installments).toHaveLength(0);
			expect(delta.statements).toHaveLength(0);
			expect([...delta.debtPurchaseIds]).toEqual(["purchase-0"]);
		});
	}
	test("new occurrences activate debt without rewriting unchanged purchases", () => {
		const previous = fixture(10);
		const next = structuredClone(previous);
		next.installments.push({
			amountCents: 834,
			hasImportedAmount: false,
			id: "occurrence",
			number: 1,
			occurrenceDate: "2026-01-10",
			purchaseId: "purchase-0",
			settledByPurchaseId: null,
			statementId: "statement",
		});
		const delta = creditBookDelta(next, previous);
		expect(delta.purchases).toHaveLength(0);
		expect(delta.installments).toHaveLength(1);
		expect([...delta.debtPurchaseIds]).toEqual(["purchase-0"]);
	});
	test("refund changes invalidate parent debt; no-op has no writes", () => {
		const previous = fixture(10);
		const next = structuredClone(previous);
		expect(creditBookDelta(next, previous).debtPurchaseIds.size).toBe(0);
		next.refunds.push({
			amountCents: 100,
			cancellationEligible: false,
			createdAt: "2026-01-20",
			creditDate: "2026-01-20",
			creditStatementId: "statement",
			deletedAt: null,
			id: "refund",
			policy: "KEEP_INSTALLMENTS",
			purchaseId: "purchase-3",
			updatedAt: "2026-01-20",
		});
		expect([...creditBookDelta(next, previous).debtPurchaseIds]).toEqual(["purchase-3"]);
	});
});
