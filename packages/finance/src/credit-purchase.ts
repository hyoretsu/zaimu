/** Money in normalized purchase records is an integer number of cents. */
export function assertCents(value: number, minimum = 0) {
	if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError("Valor monetário inválido");
	return value;
}

export function sumCents(values: readonly number[]) {
	return values.reduce((sum, value) => assertCents(sum + assertCents(value)), 0);
}

export function assertDateKey(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Data inválida");
	const date = new Date(`${value}T12:00:00Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
		throw new RangeError("Data inválida");
	return value;
}

export interface PurchaseMetadata {
	description: string;
	storeName: string | null;
	categoryId: string | null;
	tagIds: readonly string[];
}

/** Canonical purchase. Neither an invoice entry nor a payment. */
export interface CreditPurchase extends PurchaseMetadata {
	id: string;
	creditCardId: string;
	purchaseDate: string;
	totalAmountCents: number;
	/** Includes imported overrides, including not-yet-materialized occurrences. */
	installmentAmountsCents: readonly number[];
}

/** Historical invoice occurrence. Metadata is always resolved from purchaseId. */
export interface CreditInstallment {
	id: string;
	purchaseId: string;
	number: number;
	amountCents: number;
	statementId: string;
	occurrenceDate: string;
	hasImportedAmount: boolean;
	settledByPurchaseId: string | null;
}

export interface InstallmentProjection {
	purchaseId: string;
	number: number;
	amountCents: number;
	occurrenceDate: string;
}

export function assertPurchase(purchase: CreditPurchase) {
	assertDateKey(purchase.purchaseDate);
	assertCents(purchase.totalAmountCents, 1);
	if (!purchase.id || !purchase.creditCardId || !purchase.installmentAmountsCents.length)
		throw new RangeError("Compra inválida");
	for (const amount of purchase.installmentAmountsCents) assertCents(amount, 1);
	if (sumCents(purchase.installmentAmountsCents) !== purchase.totalAmountCents)
		throw new RangeError("O total da compra deve corresponder às parcelas");
	return purchase;
}

/** Stable month arithmetic: Jan 31 -> Feb 28 -> Mar 31, not Mar 28. */
export function installmentOccurrenceDate(purchaseDate: string, number: number) {
	assertDateKey(purchaseDate);
	if (!Number.isSafeInteger(number) || number < 1) throw new RangeError("Parcela inválida");
	const date = new Date(`${purchaseDate}T12:00:00Z`);
	const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + number - 1, 1, 12));
	const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
	target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
	return target.toISOString().slice(0, 10);
}

/** Preserve exact imported values. Only unknown installments divide the remaining cents. */
export function distributePurchaseCents(
	totalAmountCents: number,
	count: number,
	importedAmounts: ReadonlyMap<number, number> = new Map(),
) {
	assertCents(totalAmountCents, 1);
	if (!Number.isSafeInteger(count) || count < 1 || count > 48)
		throw new RangeError("Parcelamento inválido");
	for (const [number, amount] of importedAmounts) {
		if (!Number.isInteger(number) || number < 1 || number > count)
			throw new RangeError("Parcela importada inválida");
		assertCents(amount, 1);
	}
	const importedTotal = sumCents([...importedAmounts.values()]);
	const remaining = totalAmountCents - importedTotal;
	const unknownCount = count - importedAmounts.size;
	if (remaining < unknownCount || (!unknownCount && remaining !== 0))
		throw new RangeError("O total não comporta as parcelas importadas");
	const base = unknownCount ? Math.floor(remaining / unknownCount) : 0;
	let extra = unknownCount ? remaining % unknownCount : 0;
	return Array.from({ length: count }, (_, index) => {
		const imported = importedAmounts.get(index + 1);
		if (imported !== undefined) return imported;
		return base + (extra-- > 0 ? 1 : 0);
	});
}

/** Projections are pure values, never historical records or debt/reward events. */
export function projectInstallments(purchase: CreditPurchase): InstallmentProjection[] {
	assertPurchase(purchase);
	return purchase.installmentAmountsCents.map((amountCents, index) => ({
		amountCents,
		number: index + 1,
		occurrenceDate: installmentOccurrenceDate(purchase.purchaseDate, index + 1),
		purchaseId: purchase.id,
	}));
}

/** Return only due, missing occurrences. Caller persists with UNIQUE(purchaseId, number). */
export function dueInstallments(
	purchase: CreditPurchase,
	existing: readonly CreditInstallment[],
	asOf: string,
) {
	assertDateKey(asOf);
	const numbers = new Set<number>();
	for (const installment of existing.filter(item => item.purchaseId === purchase.id)) {
		if (
			!Number.isInteger(installment.number) ||
			installment.number < 1 ||
			installment.number > purchase.installmentAmountsCents.length ||
			numbers.has(installment.number)
		)
			throw new RangeError("Parcela duplicada ou inválida");
		numbers.add(installment.number);
	}
	return projectInstallments(purchase).filter(
		installment => installment.occurrenceDate <= asOf && !numbers.has(installment.number),
	);
}

/** One shared resolver prevents stale copied metadata in invoice/refund read models. */
export function purchaseMetadata(purchase: CreditPurchase): PurchaseMetadata {
	return {
		categoryId: purchase.categoryId,
		description: purchase.description,
		storeName: purchase.storeName,
		tagIds: [...purchase.tagIds],
	};
}
