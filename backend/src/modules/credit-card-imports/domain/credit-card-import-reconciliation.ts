interface ImportedPurchaseShape {
	description: string;
	installmentAmount: number | string;
	installments: number;
	purchaseDate: Date | string;
	storeName: null | string;
	totalAmount: number | string;
}

interface ExistingPurchaseShape {
	description: string;
	existingInstallments: number;
	installmentAmount: number | string;
	installments: number;
	purchaseDate: Date | string;
	storeName: null | string;
	totalAmount: number | string;
}

const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const reconciliationToleranceInCents = 100;

export function hasCompatibleInstallmentAmount(
	importedAmount: number | string,
	existingAmount: number | string,
	_installments: number,
) {
	return (
		Math.abs(Math.round(Number(importedAmount) * 100) - Math.round(Number(existingAmount) * 100)) <=
		reconciliationToleranceInCents
	);
}

function hasCompatibleTotalAmount(
	importedAmount: number | string,
	existingAmount: number | string,
	_installments: number,
) {
	return (
		Math.abs(Math.round(Number(importedAmount) * 100) - Math.round(Number(existingAmount) * 100)) <=
		reconciliationToleranceInCents
	);
}

export function matchesExistingCreditPurchase(item: ImportedPurchaseShape, candidate: ExistingPurchaseShape) {
	return (
		candidate.installments === item.installments &&
		candidate.existingInstallments <= item.installments &&
		dateKey(candidate.purchaseDate) === dateKey(item.purchaseDate) &&
		hasCompatibleInstallmentAmount(item.installmentAmount, candidate.installmentAmount, item.installments) &&
		hasCompatibleTotalAmount(item.totalAmount, candidate.totalAmount, item.installments)
	);
}
