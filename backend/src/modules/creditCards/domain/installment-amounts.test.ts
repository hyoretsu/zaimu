import { describe, expect, test } from "bun:test";
import { redistributeInstallmentAmounts, sumInstallmentAmounts } from "./installment-amounts";

describe("redistributeInstallmentAmounts", () => {
	test("redistributes the parent total without changing imported installments", () => {
		expect(
			redistributeInstallmentAmounts(100, [
				{ currentInstallment: 1, hasImportedAmount: true, installmentAmount: 30.01 },
				{ currentInstallment: 2, hasImportedAmount: false, installmentAmount: 30 },
				{ currentInstallment: 3, hasImportedAmount: false, installmentAmount: 30 },
			]),
		).toEqual([30.01, 35, 34.99]);
	});

	test("rejects a new total that cannot preserve every imported installment", () => {
		expect(() =>
			redistributeInstallmentAmounts(30, [
				{ currentInstallment: 1, hasImportedAmount: true, installmentAmount: 20 },
				{ currentInstallment: 2, hasImportedAmount: true, installmentAmount: 20 },
			]),
		).toThrow("O total não pode alterar parcelas importadas");
	});

	test("sums installments in cents without floating-point drift", () => {
		expect(sumInstallmentAmounts([33.33, 33.33, 33.34])).toBe(100);
	});
});
