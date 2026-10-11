import { expect, test } from "bun:test";
import {
	type CreditBook,
	newBookPurchase,
	refinanceBookPurchase,
	removeBookPurchase,
} from "@zaimu/finance/credit-book";
import { restoreRefinancingDebtSplits } from "./refinancing-debt-restoration";

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

// Legacy books may contain chains created before nested refinancing was blocked.
function refinanceLegacyPurchase(book: CreditBook, purchaseId: string) {
	const settled = book.installments.filter(item => item.settledByPurchaseId === purchaseId);
	for (const item of settled) item.settledByPurchaseId = null;
	refinanceBookPurchase(book, purchaseId, { installments: 3, purchaseDate: "2026-01-10", totalAmount: 90 });
	for (const item of settled) item.settledByPurchaseId = purchaseId;
}

test("deleting refinancing restores the source debt split", () => {
	const { book, source } = fixture();
	const before = structuredClone(book);
	refinanceBookPurchase(book, source.id, { installments: 2, purchaseDate: "2026-01-10", totalAmount: 70 });
	book.purchases.at(-1)!.debtSplitRule = {
		mode: "FIXED",
		ownerIncluded: true,
		participants: [{ debtPersonId: "person", fixedAmount: 50 }],
	};
	book.purchases.find(p => p.id === book.purchases.at(-2)!.id)!.debtSplitRule = null;
	const saved = structuredClone(book);
	removeBookPurchase(book, book.purchases[1]!.id);
	restoreRefinancingDebtSplits(book, saved);
	expect(source.debtSplitRule).toMatchObject({
		mode: "FIXED",
		participants: [{ debtPersonId: "person", fixedAmount: 50 }],
	});
});

test("deleting an intermediate refinancing restores debt from its deleted descendant", () => {
	const { book, source } = fixture();
	let before = structuredClone(book);
	refinanceBookPurchase(book, source.id, { installments: 2, purchaseDate: "2026-01-10", totalAmount: 70 });
	book.purchases.at(-1)!.debtSplitRule = {
		mode: "FIXED",
		ownerIncluded: true,
		participants: [{ debtPersonId: "person", fixedAmount: 50 }],
	};
	book.purchases.find(p => p.id === book.purchases.at(-2)!.id)!.debtSplitRule = null;
	const target = book.purchases[1]!;
	before = structuredClone(book);
	refinanceLegacyPurchase(book, target.id);
	book.purchases.at(-1)!.debtSplitRule = {
		mode: "FIXED",
		ownerIncluded: true,
		participants: [{ debtPersonId: "person", fixedAmount: 50 }],
	};
	book.purchases.find(p => p.id === book.purchases.at(-2)!.id)!.debtSplitRule = null;
	before = structuredClone(book);
	removeBookPurchase(book, target.id);
	restoreRefinancingDebtSplits(book, before);
	expect(book.purchases).toHaveLength(1);
	expect(source.debtSplitRule).toMatchObject({ participants: [{ fixedAmount: 50 }] });
});
