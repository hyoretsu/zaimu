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

test("an ordinary purchase imports an unconfirmed installment without duplicating its root", () => {
	const amazon = {
		...purchase,
		currentInstallment: 11,
		description: "AMAZON RETAIL BR CPI SAO PAULO",
		installmentAmount: 17.12,
		installments: 12,
		purchaseDate: "2025-09-17",
		totalAmount: 205.44,
	};
	const roots = new Map([[amazon.externalId, "amazon-root"]]);
	const installments = [
		{ currentInstallment: 10, hasImportedAmount: true, id: "tenth", parentId: "amazon-root" },
		{ currentInstallment: 11, hasImportedAmount: false, id: "eleventh", parentId: "amazon-root" },
	];
	expect(selectNewImportPurchases([amazon], roots, installments, new Set())).toEqual([
		{ ...amazon, reconciledCreditPurchaseId: "amazon-root" },
	]);
	expect(selectNewImportPurchases([amazon], roots, installments, new Set([amazon.externalId]))).toEqual([]);
	expect(
		selectNewImportPurchases(
			[amazon],
			roots,
			installments.map(item => ({ ...item, hasImportedAmount: true })),
			new Set(),
		),
	).toEqual([]);
});

test("existing single purchases, charges and refunds remain excluded", () => {
	const roots = new Map([[purchase.externalId, "existing"]]);
	for (const existing of [
		{ ...purchase, description: "AMAZON", installments: 1 },
		{ ...purchase, description: "Encargo", installments: 1 },
		{ ...purchase, description: "Estorno AMAZON", installmentAmount: -17.12 },
	]) {
		expect(selectNewImportPurchases([existing], roots, [], new Set())).toEqual([]);
	}
});
