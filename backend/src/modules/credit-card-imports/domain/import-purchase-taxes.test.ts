import { expect, test } from "bun:test";
import { distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import { associateImportTax, readImportTaxes } from "./import-purchase-taxes";
import { selectNewImportPurchases } from "./select-new-import-purchases";

test("BRL purchase absorbs IOF without changing invoice total", () => {
	const purchase = { installmentAmount: 52.77, taxes: [], totalAmount: 52.77 };
	const result = associateImportTax(purchase, { amount: 1.85, name: "IOF INTERNACIONAL" });
	expect(result).toEqual({
		installmentAmount: 54.62,
		taxes: [{ amount: 1.85, name: "IOF INTERNACIONAL" }],
		totalAmount: 54.62,
	});
	expect(purchase.totalAmount).toBe(52.77);
	expect(result.installmentAmount).toBeCloseTo(52.77 + 1.85, 6);
});

test("IOF affects only current installment, preserving other purchase installments", () => {
	const result = associateImportTax(
		{ installmentAmount: 100, taxes: [], totalAmount: 300 },
		{ amount: 1.85, name: "IOF" },
	);
	expect(
		distributePurchaseCents(
			Math.round(result.totalAmount * 100),
			3,
			new Map([[2, Math.round(result.installmentAmount * 100)]]),
		),
	).toEqual([10000, 10185, 10000]);
});

test("accumulates independent taxes with decimal precision", () => {
	const result = associateImportTax(
		{ installmentAmount: 0.2, taxes: [{ amount: 0.01, name: "Imposto" }], totalAmount: 0.2 },
		{ amount: 0.1, name: "IOF" },
	);
	expect(result.totalAmount).toBe(0.3);
	expect(result.taxes).toHaveLength(2);
});

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid tax %s", amount => {
	expect(() =>
		associateImportTax({ installmentAmount: 10, taxes: [], totalAmount: 10 }, { amount, name: "IOF" }),
	).toThrow();
});

test("legacy batches without taxes remain readable", () => {
	expect(readImportTaxes(null)).toEqual([]);
	expect(readImportTaxes("[]")).toEqual([]);
});

test("linked IOF alias prevents repeat import while pending or approved", () => {
	const tax = {
		currentInstallment: 1,
		description: "IOF INTERNACIONAL",
		externalId: "iof",
		installmentAmount: 1.85,
		installments: 1,
		isStatementCharge: true,
		purchaseDate: "2026-06-08",
		totalAmount: 1.85,
	};
	expect(
		selectNewImportPurchases([tax], new Map(), [], [{ currentInstallment: 1, externalId: "iof" }]),
	).toEqual([]);
	expect(selectNewImportPurchases([tax], new Map([["iof", "purchase"]]), [], [])).toEqual([]);
});
