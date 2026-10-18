import { expect, test } from "bun:test";
import { importedAnticipation, withImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { existingPurchaseImportValues } from "./existing-purchase-import-values";

const original = {
	description: "Amazon",
	purchaseDate: new Date("2026-05-27T12:00:00Z"),
	storeName: "Loja Amazon",
	time: "14:30",
	totalAmount: "217.90",
};

test("automatic reconciliation inherits original metadata without replacing imported installment amounts", () => {
	const item = {
		currentInstallment: 2,
		description: "AMAZONMKTPLC",
		installmentAmount: 21.79,
		installments: 10,
	};
	expect({ ...item, ...existingPurchaseImportValues(item.description, original) }).toEqual({
		...item,
		...original,
	});
});

test("anticipated installments retain their imported amount markers with the original description", () => {
	const description = withImportedAnticipation("AMAZONMKTPLC", [
		{ amountCents: 2100, number: 3 },
		{ amountCents: 2100, number: 4 },
	]);
	const values = existingPurchaseImportValues(description, original);
	expect(values.description).toBe(
		withImportedAnticipation("Amazon", [
			{ amountCents: 2100, number: 3 },
			{ amountCents: 2100, number: 4 },
		]),
	);
	expect(importedAnticipation(values.description)).toEqual(importedAnticipation(description));
});
