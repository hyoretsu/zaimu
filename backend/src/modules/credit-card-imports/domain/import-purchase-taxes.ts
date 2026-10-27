export interface ImportedPurchaseTax {
	name: string;
	amount: number;
}

export function readImportTaxes(value: unknown): ImportedPurchaseTax[] {
	if (!Array.isArray(value)) return [];
	return value.map(tax => ({ ...tax, amount: Number(tax.amount) }));
}

/** Taxes are included in the reviewed total, never added a second time on approval. */
export function associateImportTax(
	purchase: { totalAmount: number; installmentAmount: number; taxes: ImportedPurchaseTax[] },
	tax: ImportedPurchaseTax,
) {
	if (!Number.isFinite(tax.amount) || tax.amount <= 0 || !tax.name.trim())
		throw new Error("Informe um imposto com nome e valor positivo.");
	const add = (amount: number) => Math.round((amount + tax.amount) * 1e6) / 1e6;
	return {
		installmentAmount: add(purchase.installmentAmount),
		taxes: [...purchase.taxes, { ...tax, name: tax.name.trim() }],
		totalAmount: add(purchase.totalAmount),
	};
}
