interface DisplayableTransaction {
	date: string;
	id: string;
	isHidden?: boolean;
}

export interface TransactionDisplayGroup<T extends DisplayableTransaction> {
	id: string;
	kind: "future" | "hidden" | "visible";
	transactions: T[];
}

export function groupTransactionsForDisplay<T extends DisplayableTransaction>(
	transactions: T[],
	today: string,
): TransactionDisplayGroup<T>[] {
	return transactions.reduce<TransactionDisplayGroup<T>[]>((groups, transaction) => {
		const kind =
			transaction.date.slice(0, 10) > today ? "future" : transaction.isHidden ? "hidden" : "visible";
		const previousGroup = groups.at(-1);

		if (previousGroup?.kind === kind) {
			previousGroup.transactions.push(transaction);
			return groups;
		}

		groups.push({ id: `${kind}-${transaction.id}`, kind, transactions: [transaction] });
		return groups;
	}, []);
}
