interface ImportedPurchaseShape {
	description: string;
	installmentAmount: number | string;
	installments: number;
	purchaseDate: Date | string;
	storeName: null | string;
}

interface ExistingPurchaseShape {
	description: string;
	existingInstallments: number;
	installmentAmount: number | string;
	purchaseDate: Date | string;
	storeName: null | string;
}

const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const normalize = (value: string) =>
	value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function matchesExistingCreditPurchase(item: ImportedPurchaseShape, candidate: ExistingPurchaseShape) {
	const names = [item.description, item.storeName].filter(Boolean).map(value => normalize(value!));
	const candidateNames = [candidate.description, candidate.storeName]
		.filter(Boolean)
		.map(value => normalize(value!));
	return (
		candidate.existingInstallments <= item.installments &&
		dateKey(candidate.purchaseDate) === dateKey(item.purchaseDate) &&
		Number(candidate.installmentAmount) === Number(item.installmentAmount) &&
		names.some(name => candidateNames.includes(name))
	);
}
