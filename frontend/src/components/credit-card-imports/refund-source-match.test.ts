import { expect, test } from "bun:test";
import { withImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { eligibleRefundSources, matchingRefundSource } from "./refund-source-match";

const item = {
	description: "AMAZON BR SAO PAULO BRA",
	installmentAmount: -176.03,
	purchaseDate: "2026-04-30",
};
const source = {
	description: "AMAZON BR SAO PAULO",
	id: "purchase",
	purchaseDate: "2026-04-30",
	refundableAmount: 176.03,
	totalAmount: 176.03,
};

test("identifies the unique full refund, but leaves ambiguous or unrelated credits to manual selection", () => {
	expect(matchingRefundSource(item, [source])?.id).toBe("purchase");
	expect(matchingRefundSource(item, [source, { ...source, id: "other" }])).toBeUndefined();
	for (const changes of [
		{ refundableAmount: 100 },
		{ totalAmount: 200 },
		{ purchaseDate: "2026-04-29" },
		{ description: "OUTRA LOJA" },
	])
		expect(matchingRefundSource(item, [{ ...source, ...changes }])).toBeUndefined();
	expect(matchingRefundSource(item, [])).toBeUndefined();
});

test("selects original for a partial cancellation by its original total, with enough refundable balance", () => {
	const cancellation = {
		...item,
		description: withImportedAnticipation(item.description, [
			{ amountCents: 5000, number: 2 },
			{ amountCents: 5000, number: 3 },
		]),
		installmentAmount: -100,
		totalAmount: -150,
	};
	const original = { ...source, installments: 3, refundableAmount: 150, totalAmount: 150 };
	expect(matchingRefundSource(cancellation, [original])?.id).toBe(source.id);
	expect(matchingRefundSource(cancellation, [original, { ...original, id: "other" }])).toBeUndefined();
	expect(matchingRefundSource(cancellation, [{ ...original, refundableAmount: 99 }])).toBeUndefined();
});

test("matches the unique 176.03 purchase in eight installments despite different credit date and label", () => {
	const refund = {
		...item,
		description: withImportedAnticipation(
			"CREDITO LOJA",
			Array.from({ length: 8 }, (_, index) => ({ amountCents: index < 3 ? 2201 : 2200, number: index + 1 })),
		),
		installments: 8,
		purchaseDate: "2026-05-20",
		totalAmount: -176.03,
	};
	const original = { ...source, installments: 8 };
	expect(matchingRefundSource(refund, [original])?.id).toBe("purchase");
	expect(matchingRefundSource(refund, [{ ...original, id: "pending:purchase" }])?.id).toBe(
		"pending:purchase",
	);
	expect(matchingRefundSource(refund, [original, { ...original, id: "other" }])).toBeUndefined();
	for (const changes of [{ installments: 7 }, { totalAmount: 176.04 }, { refundableAmount: 176.02 }])
		expect(matchingRefundSource(refund, [{ ...original, ...changes }])).toBeUndefined();
	expect(
		matchingRefundSource(refund, [original, { ...original, id: "different-plan", installments: 10 }])?.id,
	).toBe("purchase");
});

test("filters by the last eight exact installments in eight or nine installment purchases", () => {
	const refund = {
		...item,
		description: withImportedAnticipation(
			"LOJA",
			Array.from({ length: 8 }, (_, i) => ({ amountCents: i === 0 ? 2203 : 2200, number: i + 1 })),
		),
	};
	const eight = { ...source, installmentAmountsCents: [2203, ...Array(7).fill(2200)], installments: 8 };
	const nine = {
		...source,
		id: "nine",
		installmentAmountsCents: [2200, 2203, ...Array(7).fill(2200)],
		installments: 9,
		totalAmount: 198.03,
	};
	const wrongTail = { ...nine, id: "wrong", installmentAmountsCents: [2203, ...Array(8).fill(2200)] };
	expect(
		eligibleRefundSources(refund, [
			eight,
			nine,
			wrongTail,
			{ ...nine, id: "ten", installments: 10 },
			{ ...eight, id: "spent", refundableAmount: 1 },
		]).map(p => p.id),
	).toEqual(["purchase", "nine"]);
	expect(matchingRefundSource(refund, [nine, wrongTail])?.id).toBe("nine");
	expect(matchingRefundSource(refund, [eight, nine])).toBeUndefined();
});
