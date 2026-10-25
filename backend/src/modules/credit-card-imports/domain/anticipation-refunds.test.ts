import { expect, test } from "bun:test";
import { importedAnticipation, withImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { anticipationRefundPairs, combineAnticipationRefunds } from "./anticipation-refunds";

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

test("combines offsetting entries into one refund with installment evidence without changing identities or original", () => {
	const input = [original, anticipation, credit];
	const rows = combineAnticipationRefunds(input);
	expect(rows).toHaveLength(2);
	expect(rows[0]).toBe(original);
	expect(rows[1]).toMatchObject({
		externalId: "credit",
		installmentAmount: -100,
		installments: 3,
		totalAmount: -100,
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

test("combines a unique later generic credit even when the original plan needs correction", () => {
	const tail = Array.from({ length: 7 }, (_, i) => ({ amountCents: 3112, number: i + 2 }));
	const anticipated = {
		...anticipation,
		description: withImportedAnticipation("Cabo riser", tail),
		installments: 8,
		purchaseDate: "2026-08-08",
		totalAmount: 248.96,
	};
	const generic = {
		...credit,
		description: "Crédito concedido",
		installmentAmount: -249,
		purchaseDate: "2026-09-04",
		totalAmount: -249,
	};
	const source = {
		id: "riser",
		installmentAmountsCents: [3116, ...tail.map(p => p.amountCents)],
		purchaseDate: "2026-08-08",
		totalAmount: 249,
	};
	const [refund] = combineAnticipationRefunds([anticipated, generic], [source]);
	expect(refund).toMatchObject({
		installmentAmount: -249,
		purchaseDate: "2026-09-04",
		reconciledCreditPurchaseId: "riser",
		totalAmount: -249,
	});
	expect(importedAnticipation(refund!.description)).toEqual(tail);
	for (const sources of [[], [source, { ...source, id: "other" }], [{ ...source, totalAmount: 249.01 }]])
		expect(anticipationRefundPairs([anticipated, generic], sources)).toHaveLength(1);
	expect(
		anticipationRefundPairs([anticipated, { ...generic, purchaseDate: "2026-08-07" }], [source]),
	).toEqual([]);
	expect(anticipationRefundPairs([anticipated, generic, { ...generic }], [source])).toEqual([]);
});

test("combines generic credit against an exact complete bank plan without an existing purchase", () => {
	const full = {
		...anticipation,
		description: withImportedAnticipation("Loja", [{ amountCents: 5000, number: 1 }, ...parts]),
		purchaseDate: "2026-04-30",
	};
	const generic = {
		...credit,
		description: "Crédito concedido",
		installmentAmount: -150,
		purchaseDate: "2026-05-02",
	};
	expect(combineAnticipationRefunds([full, generic])).toHaveLength(1);
	const unrelated = {
		id: "unrelated",
		installmentAmountsCents: [20000],
		purchaseDate: "2026-01-01",
		totalAmount: 200,
	};
	expect(combineAnticipationRefunds([full, generic], [unrelated])[0]).toMatchObject({
		reconciledCreditPurchaseId: undefined,
	});
	expect(anticipationRefundPairs([full, { ...generic, installmentAmount: -149.99 }])).toEqual([]);
});

test("credit below anticipated sum remains an anticipation plus separate discount", () => {
	const discounted = { ...credit, installmentAmount: -99.99, totalAmount: -99.99 };
	expect(combineAnticipationRefunds([anticipation, discounted])).toEqual([anticipation, discounted]);
	for (const amount of [100, 100.01, 150.01]) {
		const [refund] = combineAnticipationRefunds([anticipation, { ...credit, installmentAmount: -amount }]);
		expect(refund?.totalAmount).toBe(-amount);
		expect(importedAnticipation(refund!.description)).toEqual(parts);
	}
});
