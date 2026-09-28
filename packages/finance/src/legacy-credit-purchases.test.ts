import { expect, test } from "bun:test";
import { type LegacyCreditPurchase, normalizeLegacyCreditPurchases } from "./legacy-credit-purchases";

const root: LegacyCreditPurchase = {
	categoryId: "category",
	creditCardId: "card",
	currentInstallment: 1,
	description: "Compra",
	hasImportedAmount: true,
	id: "purchase",
	installmentAmount: 9,
	installments: 3,
	purchaseDate: "2024-08-10",
	statementId: "august",
	storeName: "Loja",
	tagIds: ["tag"],
	totalAmount: 30.01,
};
const statements = [{ id: "august", statementDate: "2024-08-15" }];

test("preserves IDs, imported cents and canonical metadata while leaving future cycles unmaterialized", () => {
	const result = normalizeLegacyCreditPurchases([root], statements);
	expect(result.purchases).toEqual([
		expect.objectContaining({
			id: "purchase",
			installmentAmountsCents: [900, 1051, 1050],
			storeName: "Loja",
			tagIds: ["tag"],
			totalAmountCents: 3001,
		}),
	]);
	expect(result.installments).toEqual([
		expect.objectContaining({ amountCents: 900, id: "purchase", number: 1, purchaseId: "purchase" }),
	]);
});

test("linked legacy refund keeps ID; unlinked imported credit needs review", () => {
	const linked: LegacyCreditPurchase = {
		...root,
		currentInstallment: 1,
		id: "linked",
		installmentAmount: -5,
		installments: 1,
		isRefund: true,
		purchaseDate: "2024-09-20",
		refundOfPurchaseId: root.id,
		totalAmount: -5,
	};
	const orphan = { ...linked, id: "orphan", refundOfPurchaseId: null };
	const result = normalizeLegacyCreditPurchases([root, linked, orphan], statements);
	expect(result.refunds).toEqual([
		expect.objectContaining({ amountCents: 500, id: "linked", purchaseId: root.id }),
	]);
	expect(result.unlinkedRefunds).toEqual([orphan]);
});

test("rejects duplicate materialized installments instead of silently overwriting them", () => {
	expect(() =>
		normalizeLegacyCreditPurchases(
			[root, { ...root, currentInstallment: 1, id: "duplicate", parentId: root.id }],
			statements,
		),
	).toThrow();
});

test("preserves manually edited historical values, even without imported flag", () => {
	const manuallyEdited = { ...root, hasImportedAmount: false, installmentAmount: 8.99 };
	const result = normalizeLegacyCreditPurchases([manuallyEdited], statements);
	expect(result.purchases[0]?.installmentAmountsCents).toEqual([899, 1051, 1051]);
	expect(result.installments[0]?.amountCents).toBe(899);
});

test("rejects crossed card links and over-refunded legacy purchases", () => {
	expect(() =>
		normalizeLegacyCreditPurchases(
			[
				root,
				{
					...root,
					creditCardId: "other-card",
					currentInstallment: 2,
					id: "child",
					parentId: root.id,
				},
			],
			statements,
		),
	).toThrow();
	const refund = {
		...root,
		id: "refund",
		installmentAmount: -30.02,
		installments: 1,
		isRefund: true,
		refundOfPurchaseId: root.id,
		totalAmount: -30.02,
	};
	expect(() => normalizeLegacyCreditPurchases([root, refund], statements)).toThrow();
});
