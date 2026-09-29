import { expect, test } from "bun:test";
import { selectNewImportPurchases } from "./select-new-import-purchases";

const purchase = {
	currentInstallment: 10,
	description: "FIN CINEPOLIS · IOF R$ 0,18",
	externalId: "financing-key",
	installmentAmount: 10.34,
	installments: 16,
	purchaseDate: "2025-11-09",
	totalAmount: 165.44,
};

test("a subsequent financed installment reconciles with its root, but repeating either invoice imports nothing", () => {
	const root = new Map([[purchase.externalId, "root-id"]]);
	const imported = [{ currentInstallment: 10, hasImportedAmount: true, id: "child-10", parentId: "root-id" }];
	expect(selectNewImportPurchases([purchase], root, imported, new Set())).toEqual([]);
	const next = { ...purchase, currentInstallment: 11, installmentAmount: 10.37 };
	expect(selectNewImportPurchases([next], root, imported, new Set())).toEqual([
		{ ...next, reconciledCreditPurchaseId: "root-id" },
	]);
	expect(selectNewImportPurchases([next], root, imported, new Set([purchase.externalId]))).toEqual([]);
	expect(
		selectNewImportPurchases(
			[next],
			root,
			[...imported, { currentInstallment: 11, hasImportedAmount: true, id: "child-11", parentId: "root-id" }],
			new Set(),
		),
	).toEqual([]);
});

test("an anticipated installment remains eligible when its root is already imported", () => {
	const anticipated = {
		...purchase,
		description: "MP*ALIEXPRESS [[anticipated:2:3446;3:3446]]",
		externalId: "anticipated-key",
	};
	const root = new Map([[anticipated.externalId, "root-id"]]);
	const imported = [{ currentInstallment: 2, hasImportedAmount: true, id: "child-2", parentId: "root-id" }];
	expect(selectNewImportPurchases([anticipated], root, imported, new Set())).toEqual([
		{ ...anticipated, reconciledCreditPurchaseId: "root-id" },
	]);
});
