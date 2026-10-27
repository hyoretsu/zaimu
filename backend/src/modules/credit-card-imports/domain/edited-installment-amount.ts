import {
	getEvenlyDistributedInstallmentAmounts,
	getImportedInstallmentAmounts,
} from "../../creditCards/domain/installment-amounts";

export function getEditedInstallmentAmount(input: {
	currentInstallment: number;
	installmentAmount: number;
	installments: number;
	previousInstallments: number;
	totalAmount: number;
}) {
	if (input.installmentAmount <= 0) return input.installmentAmount;
	if (
		input.installments === 1 &&
		input.currentInstallment === 1 &&
		Number.isFinite(input.totalAmount) &&
		input.totalAmount > 0
	)
		return input.totalAmount;
	if (input.installments !== input.previousInstallments) {
		const amount = getEvenlyDistributedInstallmentAmounts(input.totalAmount, input.installments)[
			input.currentInstallment - 1
		];
		if (amount === undefined) throw new RangeError("Parcelamento inválido");
		return amount;
	}
	getImportedInstallmentAmounts(input);
	return input.installmentAmount;
}
