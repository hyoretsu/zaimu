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

/** A changed plan can include interest; merchant similarity only suggests explicit review. */
export function isPotentialPurchaseRefinancing(
	item: ImportedPurchaseShape,
	candidate: ExistingPurchaseShape,
) {
	const merchantTokens = (description: string, storeName: null | string) =>
		`${description} ${storeName ?? ""}`
			.normalize("NFKD")
			.replace(/\p{M}/gu, "")
			.toLocaleLowerCase("pt-BR")
			.split(/[^a-z\d]+/u)
			.filter(
				token =>
					token.length >= 5 && !["google", "store", "parcela", "parcelamento", "compra"].includes(token),
			);
	const importedTokens = merchantTokens(item.description, item.storeName);
	const existingTokens = merchantTokens(candidate.description, candidate.storeName);
	return (
		item.installments > 1 &&
		item.installments !== candidate.installments &&
		Number(item.installmentAmount) > 0 &&
		Number(candidate.totalAmount) > 0 &&
		dateKey(candidate.purchaseDate) === dateKey(item.purchaseDate) &&
		importedTokens.some(token =>
			existingTokens.some(
				existing => token === existing || token.startsWith(existing) || existing.startsWith(token),
			),
		)
	);
}
