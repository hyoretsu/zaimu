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

export function hasCompatibleInstallmentAmount(
	importedAmount: number | string,
	existingAmount: number | string,
	installments: number,
) {
	const toleranceInCents = installments > 1 ? 20 : 0;
	return (
		Math.abs(Math.round(Number(importedAmount) * 100) - Math.round(Number(existingAmount) * 100)) <=
		toleranceInCents
	);
}

function hasCompatibleTotalAmount(
	importedAmount: number | string,
	existingAmount: number | string,
	installments: number,
) {
	const toleranceInCents = Math.max(0, installments - 1);
	return (
		Math.abs(Math.round(Number(importedAmount) * 100) - Math.round(Number(existingAmount) * 100)) <=
		toleranceInCents
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
