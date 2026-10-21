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
	expect(selectNewImportPurchases([purchase], root, imported, [])).toEqual([]);
	const next = { ...purchase, currentInstallment: 11, installmentAmount: 10.37 };
	expect(selectNewImportPurchases([next], root, imported, [])).toEqual([
		{ ...next, reconciledCreditPurchaseId: "root-id" },
	]);
	expect(selectNewImportPurchases([next], root, imported, [next])).toEqual([]);
	expect(
		selectNewImportPurchases(
			[next],
			root,
			[...imported, { currentInstallment: 11, hasImportedAmount: true, id: "child-11", parentId: "root-id" }],
			[],
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
	expect(selectNewImportPurchases([anticipated], root, imported, [])).toEqual([
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
	expect(selectNewImportPurchases([amazon], roots, installments, [])).toEqual([
		{ ...amazon, reconciledCreditPurchaseId: "amazon-root" },
	]);
	expect(selectNewImportPurchases([amazon], roots, installments, [amazon])).toEqual([]);
	expect(
		selectNewImportPurchases(
			[amazon],
			roots,
			installments.map(item => ({ ...item, hasImportedAmount: true })),
			[],
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
		expect(selectNewImportPurchases([existing], roots, [], [])).toEqual([]);
	}
});

test("a complete accelerated purchase can be imported again after its root was deleted", () => {
	const complete = {
		...purchase,
		currentInstallment: 1,
		description: "AMAZON BR [[anticipated:1:2203;2:2200;3:2200;4:2200;5:2200;6:2200;7:2200;8:2200]]",
		externalId: "amazon-key",
		installmentAmount: 22.03,
		installments: 8,
		purchaseDate: "2026-04-30",
		totalAmount: 176.03,
	};
	// Deleted purchases no longer appear in CreditEntry; their old IDs must not be reused.
	expect(selectNewImportPurchases([complete], new Map(), [], [])).toEqual([
		{ ...complete, reconciledCreditPurchaseId: null },
	]);
	// An already pending review stays in its current batch instead of creating another copy.
	expect(selectNewImportPurchases([complete], new Map(), [], [complete])).toEqual([]);
});

test("pending later installments do not hide earlier invoices, in either import order", () => {
	const first = { ...purchase, currentInstallment: 1, installments: 2 };
	const second = { ...first, currentInstallment: 2 };
	for (const [incoming, pending] of [
		[first, second],
		[second, first],
	] as const) {
		expect(selectNewImportPurchases([incoming], new Map(), [], [pending])).toEqual([
			{ ...incoming, reconciledCreditPurchaseId: null },
		]);
		expect(selectNewImportPurchases([incoming], new Map(), [], [incoming])).toEqual([]);
		const roots = new Map([[incoming.externalId, "root"]]);
		expect(selectNewImportPurchases([incoming], roots, [], [pending])).toEqual([
			{ ...incoming, reconciledCreditPurchaseId: "root" },
		]);
	}
});
