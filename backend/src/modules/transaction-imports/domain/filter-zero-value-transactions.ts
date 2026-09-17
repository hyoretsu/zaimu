export function filterZeroValueTransactions<T extends { amount: number }>(transactions: T[]) {
	return transactions.filter(transaction => transaction.amount !== 0);
}
