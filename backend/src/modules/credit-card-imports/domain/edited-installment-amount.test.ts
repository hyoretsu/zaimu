import { describe, expect, test } from "bun:test";
import {
	getImportedInstallmentAmounts,
	sumInstallmentAmounts,
} from "../../creditCards/domain/installment-amounts";
import { getEditedInstallmentAmount } from "./edited-installment-amount";

const purchase = {
	currentInstallment: 1,
	installmentAmount: 176.03,
	installments: 8,
	previousInstallments: 1,
	totalAmount: 176.03,
};

describe("getEditedInstallmentAmount", () => {
	test("cash total includes reviewed taxes", () => {
		expect(getEditedInstallmentAmount({ ...purchase, installments: 1, totalAmount: 177.88 })).toBe(
			177.88,
		);
	});
	test("splits a cash purchase into eight installments without changing its total", () => {
		const installmentAmount = getEditedInstallmentAmount(purchase);
		const amounts = getImportedInstallmentAmounts({ ...purchase, installmentAmount });
		expect(installmentAmount).toBe(22.01);
		expect(amounts).toEqual([22.01, 22.01, 22.01, 22, 22, 22, 22, 22]);
		expect(sumInstallmentAmounts(amounts)).toBe(176.03);
	});

	test("preserves the imported amount when the installment count is unchanged", () => {
		expect(getEditedInstallmentAmount({ ...purchase, installments: 1 })).toBe(176.03);
		expect(
			getEditedInstallmentAmount({ ...purchase, previousInstallments: 8, totalAmount: 1408.24 }),
		).toBe(176.03);
	});

	test("rejects totals too small for positive installments", () => {
		expect(() => getEditedInstallmentAmount({ ...purchase, totalAmount: 0.07 })).toThrow();
	});

	test("rejects removing the current installment", () => {
		expect(() =>
			getEditedInstallmentAmount({ ...purchase, currentInstallment: 3, installments: 2 }),
		).toThrow();
	});

	test("keeps refund values unchanged", () => {
		expect(getEditedInstallmentAmount({ ...purchase, installmentAmount: -176.03 })).toBe(-176.03);
	});
});
