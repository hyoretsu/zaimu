import { expect, test } from "bun:test";
import { type CreditBook, newBookPurchase, refinanceBookPurchase } from "@zaimu/finance/credit-book";
import { transferRefinancingDebtSplits } from "./refinancing-debt-splits";

function fixture() {
	const book: CreditBook = {
		card: {
			currency: "BRL",
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "user",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	const source = newBookPurchase(book, {
		debtSplitRule: {
			mode: "SHARES",
			ownerShares: null,
			participants: [{ debtPersonId: "person", shares: 1 }],
		},
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-01-10",
		totalAmount: 50,
	});
	return { book, source };
}

test("refinancing transfers 50 of debt to a 70 purchase once and preserves later edits", () => {
	const { book, source } = fixture();
	const before = structuredClone(book);
	refinanceBookPurchase(book, source.id, { installments: 2, purchaseDate: "2026-01-10", totalAmount: 70 });
	transferRefinancingDebtSplits(book, before);
	const target = book.purchases[1]!;
	expect(source.debtSplitRule).toBeNull();
	expect(target.debtSplitRule).toMatchObject({
		mode: "FIXED",
		participants: [{ debtPersonId: "person", fixedAmount: 50 }],
	});
	const saved = structuredClone(book);
	target.debtSplitRule = {
		mode: "FIXED",
		ownerIncluded: true,
		participants: [{ debtPersonId: "person", fixedAmount: 60 }],
	};
	transferRefinancingDebtSplits(book, saved);
	expect(target.debtSplitRule.participants[0]!.fixedAmount).toBe(60);
});

test("refinancing preserves the original participant share when owner shares the purchase", () => {
	const { book, source } = fixture();
	source.debtSplitRule = {
		mode: "SHARES",
		ownerShares: 1,
		participants: [{ debtPersonId: "person", shares: 1 }],
	};
	const before = structuredClone(book);
	refinanceBookPurchase(book, source.id, { installments: 2, purchaseDate: "2026-01-10", totalAmount: 70 });
	transferRefinancingDebtSplits(book, before);
	expect(source.debtSplitRule).toBeNull();
	expect(book.purchases[1]!.debtSplitRule).toMatchObject({ participants: [{ fixedAmount: 25 }] });
});
