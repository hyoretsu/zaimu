/** Once every installment is imported, its exact value takes precedence over an inferred total. */
export function importedPurchaseTotalCents(
	fallbackTotalCents: number,
	installments: number,
	knownAmounts: ReadonlyMap<number, number>,
) {
	if (knownAmounts.size !== installments) return fallbackTotalCents;
	for (let number = 1; number <= installments; number++) {
		if (!knownAmounts.has(number)) return fallbackTotalCents;
	}
	return [...knownAmounts.values()].reduce((sum, amount) => sum + amount, 0);
}
