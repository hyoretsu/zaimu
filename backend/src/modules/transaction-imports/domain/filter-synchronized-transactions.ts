export function filterSynchronizedTransactions<T extends { externalIds: readonly string[] }>(
	transactions: T[],
	includeSynchronized?: (transaction: T) => boolean,
) {
	return transactions.filter(
		transaction => transaction.externalIds.length === 0 || includeSynchronized?.(transaction),
	);
}
