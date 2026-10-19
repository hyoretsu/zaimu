import { expect, test } from "bun:test";
import { matchingRefundSource } from "./refund-source-match";

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
