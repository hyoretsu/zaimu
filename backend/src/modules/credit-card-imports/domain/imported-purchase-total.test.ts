import { describe, expect, test } from "bun:test";
import { distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import { importedPurchaseTotalCents } from "./imported-purchase-total";

describe("importedPurchaseTotalCents", () => {
	test.each([2600, 2602])("replaces inferred total %i with the exact imported sum", inferred => {
		const known = new Map([
			[1, 1301],
			[2, 1300],
		]);
		const total = importedPurchaseTotalCents(inferred, 2, known);

		expect(total).toBe(2601);
		expect(distributePurchaseCents(total, 2, known)).toEqual([1301, 1300]);
	});

	test("keeps the fallback total while some installments remain unknown", () => {
		const known = new Map([[1, 1301]]);
		const total = importedPurchaseTotalCents(2601, 2, known);

		expect(total).toBe(2601);
		expect(distributePurchaseCents(total, 2, known)).toEqual([1301, 1300]);
	});

	test("does not accept invalid installment numbers as a complete set", () => {
		const known = new Map([
			[1, 1301],
			[3, 1300],
		]);
		expect(importedPurchaseTotalCents(2600, 2, known)).toBe(2600);
		expect(() => distributePurchaseCents(2600, 2, known)).toThrow("Parcela importada inválida");
	});
	test("correcting the approved first installment preserves eleven confirmed amounts", () => {
		const known = new Map(Array.from({ length: 12 }, (_, index) => [index + 1, index === 0 ? 1713 : 1712]));
		known.set(1, 1718);
		const total = importedPurchaseTotalCents(20616, 12, known);
		expect(total).toBe(20550);
		expect(distributePurchaseCents(total, 12, known)).toEqual([1718, ...Array(11).fill(1712)]);
	});
});
