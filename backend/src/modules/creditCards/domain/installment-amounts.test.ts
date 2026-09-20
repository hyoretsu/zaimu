import { describe, expect, test } from "bun:test";
import {
	getMissingInstallmentNumbers,
	redistributeInstallmentAmounts,
	sumInstallmentAmounts,
} from "./installment-amounts";

describe("getMissingInstallmentNumbers", () => {
	test("does not treat a single parent purchase as a missing installment", () => {
		expect(getMissingInstallmentNumbers(1, [])).toEqual([]);
	});

	test("finds gaps in multi-installment purchases", () => {
		expect(getMissingInstallmentNumbers(4, [1, 3])).toEqual([2, 4]);
	});
});

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

	test("allocates missing installments while retaining synchronized amounts", () => {
		expect(
			redistributeInstallmentAmounts(65.45, [
				{ currentInstallment: 1, hasImportedAmount: true, installmentAmount: 13.09 },
				{ currentInstallment: 2, hasImportedAmount: false, installmentAmount: 0 },
				{ currentInstallment: 3, hasImportedAmount: false, installmentAmount: 0 },
				{ currentInstallment: 4, hasImportedAmount: false, installmentAmount: 0 },
				{ currentInstallment: 5, hasImportedAmount: false, installmentAmount: 0 },
			]),
		).toEqual([13.09, 13.09, 13.09, 13.09, 13.09]);
	});
});
