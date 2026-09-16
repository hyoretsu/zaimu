import { describe, expect, test } from "bun:test";
import {
	getEvenlyDistributedInstallmentAmounts,
	getImportedInstallmentAmounts,
	sumInstallmentAmounts,
} from "../../creditCards/domain/installment-amounts";

describe("getImportedInstallmentAmounts", () => {
	test("preserves the imported installment while distributing the remaining cents", () => {
		const amounts = getImportedInstallmentAmounts({
			currentInstallment: 2,
			installmentAmount: 13,
			installments: 2,
			totalAmount: 26.01,
		});

		expect(amounts).toEqual([13.01, 13]);
		expect(sumInstallmentAmounts(amounts)).toBe(26.01);
	});

	test("keeps the imported amount at its actual installment position", () => {
		const amounts = getImportedInstallmentAmounts({
			currentInstallment: 2,
			installmentAmount: 3.34,
			installments: 3,
			totalAmount: 10.01,
		});

		expect(amounts).toEqual([3.34, 3.34, 3.33]);
		expect(sumInstallmentAmounts(amounts)).toBe(10.01);
	});

	test("distributes manual installments in cents without changing their total", () => {
		const amounts = getEvenlyDistributedInstallmentAmounts(26.01, 2);

		expect(amounts).toEqual([13.01, 13]);
		expect(sumInstallmentAmounts(amounts)).toBe(26.01);
	});
});
