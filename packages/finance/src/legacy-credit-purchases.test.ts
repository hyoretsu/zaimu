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
