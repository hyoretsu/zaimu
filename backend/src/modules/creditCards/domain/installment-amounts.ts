interface ImportedInstallmentAmountsInput {
	currentInstallment: number;
	installmentAmount: number;
	installments: number;
	totalAmount: number;
}

const toCents = (amount: number) => Math.round(amount * 100);

function distributeCents(totalInCents: number, count: number) {
	const amountInCents = Math.floor(totalInCents / count);
	const remainderInCents = totalInCents % count;
	return Array.from({ length: count }, (_, index) => amountInCents + (index < remainderInCents ? 1 : 0));
}

export function getEvenlyDistributedInstallmentAmounts(totalAmount: number, installments: number) {
	if (!Number.isInteger(installments) || installments < 1) throw new RangeError("Parcelamento inválido");
	const totalAmountInCents = toCents(totalAmount);
	if (totalAmountInCents < installments) throw new RangeError("O total não comporta todas as parcelas");
	return distributeCents(totalAmountInCents, installments).map(amountInCents => amountInCents / 100);
}

export function getMissingInstallmentNumbers(installments: number, existingInstallmentNumbers: number[]) {
	if (installments <= 1) return [];
	const existingNumbers = new Set(existingInstallmentNumbers);
	return Array.from({ length: installments }, (_, index) => index + 1).filter(
		currentInstallment => !existingNumbers.has(currentInstallment),
	);
}

export function redistributeInstallmentAmounts(
	totalAmount: number,
	installments: Array<{
		hasImportedAmount: boolean;
		installmentAmount: number;
		currentInstallment: number;
	}>,
) {
	if (!installments.length) throw new RangeError("Parcelamento inválido");
	const totalAmountInCents = toCents(totalAmount);
	const importedAmountInCents = installments
		.filter(installment => installment.hasImportedAmount)
		.reduce((sum, installment) => sum + toCents(installment.installmentAmount), 0);
	const adjustableInstallments = installments.filter(installment => !installment.hasImportedAmount);
	if (!adjustableInstallments.length) {
		if (importedAmountInCents !== totalAmountInCents)
			throw new RangeError("O total não pode alterar parcelas importadas");
		return installments.map(installment => installment.installmentAmount);
	}
	const adjustableAmountInCents = totalAmountInCents - importedAmountInCents;
	if (adjustableAmountInCents < adjustableInstallments.length)
		throw new RangeError("O total não comporta as parcelas ainda não importadas");
	const adjustableAmounts = distributeCents(adjustableAmountInCents, adjustableInstallments.length);
	let adjustableIndex = 0;
	return installments.map(installment =>
		installment.hasImportedAmount
			? installment.installmentAmount
			: adjustableAmounts[adjustableIndex++]! / 100,
	);
}

export function getImportedInstallmentAmounts({
	currentInstallment,
	installmentAmount,
	installments,
	totalAmount,
}: ImportedInstallmentAmountsInput) {
	if (
		!Number.isInteger(installments) ||
		installments < 1 ||
		currentInstallment < 1 ||
		currentInstallment > installments
	)
		throw new RangeError("Parcelamento inválido");
	const installmentAmountInCents = toCents(installmentAmount);
	const totalAmountInCents = toCents(totalAmount);
	if (installmentAmountInCents <= 0 || totalAmountInCents < installmentAmountInCents)
		throw new RangeError("Valores das parcelas inválidos");
	if (installments === 1) return [totalAmountInCents / 100];
	const remainingInstallments = installments - 1;
	const remainingAmountInCents = totalAmountInCents - installmentAmountInCents;
	if (remainingAmountInCents < remainingInstallments)
		throw new RangeError("O total não comporta todas as parcelas");
	const remainingAmounts = distributeCents(remainingAmountInCents, remainingInstallments);
	return Array.from({ length: installments }, (_, index) =>
		index === currentInstallment - 1 ? installmentAmountInCents / 100 : remainingAmounts.shift()! / 100,
	);
}

export function preserveImportedInstallmentAmounts(
	importedAmounts: number[],
	existingAmounts: Array<{
		hasImportedAmount: boolean;
		installmentAmount: number;
		currentInstallment: number;
	}>,
) {
	const existingByInstallment = new Map(
		existingAmounts.map(installment => [installment.currentInstallment, installment]),
	);
	return importedAmounts.map((amount, index) => {
		const existing = existingByInstallment.get(index + 1);
		return existing?.hasImportedAmount ? existing.installmentAmount : amount;
	});
}

export const sumInstallmentAmounts = (amounts: number[]) =>
	amounts.reduce((totalInCents, amount) => totalInCents + toCents(amount), 0) / 100;
