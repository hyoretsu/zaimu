import { expect, test } from "bun:test";
import type { BookRefund } from "@zaimu/finance/credit-book";
import { existingRefundMatches } from "./existing-refund-matches";

const item = {
	externalId: "bank",
	id: "item",
	installmentAmount: -249,
	purchaseDate: "2026-09-04",
	reconciledCreditPurchaseId: null,
	refundReview: null,
};
const refund: BookRefund = {
	amountCents: 24900,
	cancellationEligible: false,
	createdAt: "2026-09-04T00:00:00Z",
	creditDate: "2026-09-04",
	creditStatementId: "statement",
	deletedAt: null,
	id: "refund",
	policy: "KEEP_INSTALLMENTS",
	purchaseId: "purchase",
	updatedAt: "2026-09-04T00:00:00Z",
};

test("existing manual refund reconciles an exact imported credit without available purchase balance", () => {
	expect(existingRefundMatches([item], [refund])).toEqual([[item.id, refund]]);
});
test("ambiguous refunds or competing imported credits require review", () => {
	expect(existingRefundMatches([item], [refund, { ...refund, id: "second" }])).toEqual([]);
	expect(existingRefundMatches([item, { ...item, id: "second" }], [refund])).toEqual([]);
});
test("deleted, conflicting, changed and saved refunds are never automatically linked", () => {
	for (const changes of [
		{ deletedAt: "2026-09-05" },
		{ externalId: "other" },
		{ amountCents: 24899 },
		{ creditDate: "2026-09-03" },
	])
		expect(existingRefundMatches([item], [{ ...refund, ...changes }])).toEqual([]);
	expect(existingRefundMatches([{ ...item, refundReview: { purchaseId: "other" } }], [refund])).toEqual([]);
});
test("bank identity takes precedence over matching manual refund", () => {
	const identified = { ...refund, externalId: item.externalId };
	expect(existingRefundMatches([item], [identified, { ...refund, id: "manual" }])).toEqual([
		[item.id, identified],
	]);
});
