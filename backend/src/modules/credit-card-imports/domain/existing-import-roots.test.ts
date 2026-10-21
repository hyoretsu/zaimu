import { expect, test } from "bun:test";
import { existingImportRoots } from "./existing-import-roots";
import { selectNewImportPurchases } from "./select-new-import-purchases";

test("repeated external IDs resolve to the purchase regardless of installment order", () => {
	const purchase = {
		currentInstallment: 2,
		description: "AMAZON BR",
		externalId: "amazon-import",
		installmentAmount: 17.66,
		installments: 5,
		purchaseDate: "2026-08-26",
		totalAmount: 88.3,
	};
	const entries = [
		{
			currentInstallment: 1,
			externalId: purchase.externalId,
			hasImportedAmount: true,
			id: "root",
			isRefund: false,
			parentId: null,
			purchaseId: "root",
		},
		{
			currentInstallment: 2,
			externalId: purchase.externalId,
			hasImportedAmount: true,
			id: "second",
			isRefund: false,
			parentId: "root",
			purchaseId: "root",
		},
		{
			currentInstallment: 3,
			externalId: purchase.externalId,
			hasImportedAmount: false,
			id: "third",
			isRefund: false,
			parentId: "root",
			purchaseId: "root",
		},
	];
	for (const ordered of [entries, [...entries].reverse()]) {
		const roots = existingImportRoots(ordered);
		expect(roots.get(purchase.externalId)).toBe("root");
		const installments = ordered.filter(entry => [...roots.values()].includes(entry.purchaseId));
		expect(selectNewImportPurchases([purchase], roots, installments, [])).toEqual([]);
		const next = { ...purchase, currentInstallment: 3, description: "FIN AMAZON BR" };
		expect(selectNewImportPurchases([next], roots, installments, [])).toEqual([
			{ ...next, reconciledCreditPurchaseId: "root" },
		]);
	}
});

test("charges and refunds retain their own identity; manual purchases have no import identity", () => {
	expect([
		...existingImportRoots([
			{ externalId: "charge", id: "charge-id", isRefund: false, purchaseId: null },
			{ externalId: "refund", id: "refund-id", isRefund: true, purchaseId: "original" },
			{ externalId: null, id: "manual", isRefund: false, purchaseId: "manual" },
		]),
	]).toEqual([
		["charge", "charge-id"],
		["refund", "refund-id"],
	]);
});
