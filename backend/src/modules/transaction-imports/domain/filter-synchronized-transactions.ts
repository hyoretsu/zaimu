export function filterSynchronizedTransactions<T extends { externalIds: readonly string[] }>(
	transactions: T[],
) {
	return transactions.filter(transaction => transaction.externalIds.length === 0);
}
