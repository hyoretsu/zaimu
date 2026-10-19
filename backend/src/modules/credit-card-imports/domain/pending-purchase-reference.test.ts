import { expect, test } from "bun:test";
import { importedAnticipation, withImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import {
	includePendingPurchaseSources,
	pendingPurchaseId,
	withoutPendingPurchase,
	withPendingPurchase,
} from "./pending-purchase-reference";

const original = {
	description: "Amazon",
	id: "original",
	installmentAmount: 22.03,
	isStatementCharge: false,
};
const anticipated = {
	...original,
	description: withPendingPurchase(
		withImportedAnticipation("Amazon", [
			{ amountCents: 2203, number: 1 },
			{ amountCents: 2200, number: 2 },
		]),
		original.id,
	),
	id: "anticipation",
};
test("pending link preserves anticipation metadata and hides internal source", () => {
	expect(pendingPurchaseId(anticipated.description)).toBe(original.id);
	expect(importedAnticipation(anticipated.description)).toHaveLength(2);
	expect(withoutPendingPurchase(anticipated.description)).toStartWith("Amazon");
	expect(withPendingPurchase(anticipated.description, "replacement").match(/import-source/gu)).toHaveLength(
		1,
	);
});
test("approving dependent includes pending original first, exactly once", () => {
	expect(includePendingPurchaseSources([anticipated], [anticipated, original]).map(i => i.id)).toEqual([
		"original",
		"anticipation",
	]);
	expect(
		includePendingPurchaseSources([anticipated, original], [anticipated, original]).map(i => i.id),
	).toEqual(["original", "anticipation"]);
});
test("pending source must exist in same batch", () => {
	expect(() => includePendingPurchaseSources([anticipated], [anticipated])).toThrow("nesta importação");
});
test("refunds, charges and anticipation cannot be original sources", () => {
	for (const source of [
		{ ...original, installmentAmount: -22 },
		{ ...original, isStatementCharge: true },
		{ ...anticipated, id: original.id },
	])
		expect(() => includePendingPurchaseSources([anticipated], [anticipated, source])).toThrow();
});
test("cycles cannot become approval dependencies", () => {
	expect(() =>
		includePendingPurchaseSources(
			[anticipated],
			[anticipated, { ...original, description: withPendingPurchase("Amazon", anticipated.id) }],
		),
	).toThrow();
});

test("bulk approval retains dependent when original has an unresolved duplicate or missing metadata", () => {
	const other = { ...original, id: "other" };
	expect(
		includePendingPurchaseSources(
			[anticipated, other],
			[original, anticipated, other],
			source => source.id !== original.id,
		).map(i => i.id),
	).toEqual(["other"]);
	expect(
		includePendingPurchaseSources([anticipated], [original, anticipated], () => true).map(i => i.id),
	).toEqual(["original", "anticipation"]);
});
