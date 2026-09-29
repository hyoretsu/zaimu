interface IdentifiedTransaction {
	id: string;
}

export function uniqueTransactions<T extends IdentifiedTransaction>(pages: readonly (readonly T[])[]): T[] {
	const seen = new Set<string>();
	return pages.flatMap(transactions =>
		transactions.filter(transaction => {
			if (seen.has(transaction.id)) return false;
			seen.add(transaction.id);
			return true;
		}),
	);
}
