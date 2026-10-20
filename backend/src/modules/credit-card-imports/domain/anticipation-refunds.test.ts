import { expect, test } from "bun:test";
import { importedAnticipation, withImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import {
	anticipationRefundPairs,
	combineAnticipationRefunds,
	refundCancellationNumbers,
} from "./anticipation-refunds";

const parts = [
	{ amountCents: 5000, number: 2 },
	{ amountCents: 5000, number: 3 },
];
const original = {
	description: "AMAZON BR SAO PAULO",
	externalId: "original",
	installmentAmount: 50,
	installments: 3,
	purchaseDate: "2026-04-30",
	totalAmount: 150,
};
const anticipation = {
	...original,
	description: withImportedAnticipation(original.description, parts),
	externalId: "anticipation",
};
const credit = {
	...original,
	description: "Reembolso - AMAZON BR SAO PAULO BRA",
	externalId: "credit",
	installmentAmount: -100,
	installments: 1,
	totalAmount: -100,
};

test("combines offsetting entries into one partial cancellation without changing identities or original", () => {
	const input = [original, anticipation, credit];
	const rows = combineAnticipationRefunds(input);
	expect(rows).toHaveLength(2);
	expect(rows[0]).toBe(original);
	expect(rows[1]).toMatchObject({
		externalId: "credit",
		installmentAmount: -100,
		installments: 3,
		totalAmount: -150,
	});
	expect(importedAnticipation(rows[1]!.description)).toEqual(parts);
	expect(combineAnticipationRefunds(rows)).toEqual(rows);
	expect(input[2]).toBe(credit);
	expect(importedAnticipation(credit.description)).toBeNull();
});

test("leaves unrelated, mismatched and ambiguous entries separate", () => {
	for (const other of [
		{ ...credit, purchaseDate: "2026-04-29" },
		{ ...credit, description: "OUTRA LOJA" },
		{ ...credit, installmentAmount: -99.99 },
		{ ...credit, installmentAmount: -150.01 },
	])
		expect(anticipationRefundPairs([anticipation, other])).toEqual([]);
	expect(anticipationRefundPairs([anticipation, { ...anticipation }, credit])).toEqual([]);
	expect(anticipationRefundPairs([anticipation, credit, { ...credit }])).toEqual([]);
	expect(
		anticipationRefundPairs([
			{ ...anticipation, description: withImportedAnticipation("A", parts) },
			{ ...credit, description: "A" },
		]),
	).toEqual([]);
});

test("pairs legacy pending references and database money/date types", () => {
	expect(
		anticipationRefundPairs([
			{
				...anticipation,
				description: `[import-source:source-id] ${anticipation.description}`,
				installmentAmount: "50.00",
				purchaseDate: new Date("2026-04-30"),
				totalAmount: "150.00",
			},
			credit,
		]),
	).toHaveLength(1);
});

test("validates imported cancellation numbers and exact installment amounts", () => {
	const [refund] = combineAnticipationRefunds([anticipation, credit]);
	const numbers = refundCancellationNumbers(refund!.description, 10000, [5000, 5000, 5000]);
	expect(numbers).toEqual([2, 3]);
	expect(refundCancellationNumbers(credit.description, 10000, [5000, 5000, 5000])).toBeUndefined();
	expect(() => refundCancellationNumbers(refund!.description, 9999, [5000, 5000, 5000])).toThrow(
		"Valores das parcelas",
	);
	expect(() => refundCancellationNumbers(refund!.description, 10000, [5000, 4999, 5001])).toThrow(
		"Valores das parcelas",
	);
	expect(() => refundCancellationNumbers(refund!.description, 10000, [5000])).toThrow("Valores das parcelas");
});

test("preserves conflicting manual purchase links", () => {
	expect(
		anticipationRefundPairs([
			{ ...anticipation, reconciledCreditPurchaseId: "one" },
			{ ...credit, reconciledCreditPurchaseId: "two" },
		]),
	).toEqual([]);
	expect(
		anticipationRefundPairs([
			{ ...anticipation, description: `[import-source:one] ${anticipation.description}` },
			{ ...credit, description: `[import-source:two] ${credit.description}` },
		]),
	).toEqual([]);
});
