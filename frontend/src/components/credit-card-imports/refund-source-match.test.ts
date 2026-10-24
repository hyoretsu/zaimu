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
		matchingRefundSource(refund, [original, { ...original, id: "different-plan", installments: 10 }]),
	).toBeUndefined();
});

test("filters cancellation choices by any matching sum while preserving exact automatic cancellation", () => {
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
	).toEqual(["purchase", "nine", "wrong", "ten"]);
	expect(matchingRefundSource(refund, [nine, wrongTail])).toBeUndefined();
	expect(matchingRefundSource(refund, [eight, nine])).toBeUndefined();
});

test("suggests the unique full purchase before a generic bank refund, including pending purchases", () => {
	const generic = { description: "Crédito concedido", installmentAmount: -257.8, purchaseDate: "2026-10-10" };
	const before = {
		...source,
		description: "ASA*HAPPY TECNOLOGIA E",
		id: "pending:before",
		purchaseDate: "2026-10-08",
		refundableAmount: 257.8,
		totalAmount: 257.8,
	};
	const after = { ...before, id: "after", purchaseDate: "2026-10-12" };
	expect(matchingRefundSource(generic, [before, after])?.id).toBe(before.id);
	expect(matchingRefundSource(generic, [after])).toBeUndefined();
	expect(matchingRefundSource(generic, [before, { ...before, id: "ambiguous" }])).toBeUndefined();
	expect(matchingRefundSource(generic, [{ ...before, refundableAmount: 100 }])).toBeUndefined();
	expect(matchingRefundSource(generic, [{ ...before, totalAmount: 300 }])).toBeUndefined();
	expect(matchingRefundSource({ ...generic, description: "Cashback" }, [before])).toBeUndefined();
	expect(matchingRefundSource({ ...generic, description: "Crédito parcelamento" }, [before])).toBeUndefined();
});

test("partial refund choices include purchases without matching installment sums", () => {
	const refund = { description: "Crédito concedido", installmentAmount: -257.8 };
	const base = { ...source, installments: 1, refundableAmount: 257.8, totalAmount: 257.8 };
	const old = { ...base, description: "OTHER MERCHANT", id: "old", purchaseDate: "2025-01-01" };
	const subset = {
		...base,
		id: "subset",
		installmentAmountsCents: [10000, 15780, 14220],
		installments: 3,
		refundableAmount: 400,
		totalAmount: 400,
	};
	const skipped = { ...subset, id: "skipped", installmentAmountsCents: [10000, 14220, 15780] };
	const near = { ...base, id: "near", refundableAmount: 258.8, totalAmount: 258.8 };
	const outside = { ...base, id: "outside", refundableAmount: 258.81, totalAmount: 258.81 };
	const wrong = { ...base, id: "wrong", installments: 12, refundableAmount: 300, totalAmount: 300 };
	expect(eligibleRefundSources(refund, [old, subset, skipped, near, outside, wrong]).map(p => p.id)).toEqual([
		"old",
		"subset",
		"skipped",
		"near",
		"outside",
		"wrong",
	]);
	expect(eligibleRefundSources(refund, [{ ...old, id: "pending:old" }])).toHaveLength(1);
});

test("partial credits require enough remaining balance and never suggest a larger purchase", () => {
	const refund = { ...item, installmentAmount: -17.92 };
	const larger = { ...source, installments: 4, refundableAmount: 200, totalAmount: 200 };
	expect(eligibleRefundSources(refund, [larger])).toEqual([larger]);
	expect(matchingRefundSource(refund, [larger])).toBeUndefined();
	expect(eligibleRefundSources(refund, [{ ...larger, refundableAmount: 17.92 }])).toHaveLength(1);
	expect(eligibleRefundSources(refund, [{ ...larger, refundableAmount: 17.91 }])).toEqual([]);
	for (const installmentAmount of [0, Number.NaN, Number.POSITIVE_INFINITY])
		expect(eligibleRefundSources({ ...refund, installmentAmount }, [larger])).toEqual([]);
});
