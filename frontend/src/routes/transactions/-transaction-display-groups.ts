interface DisplayableTransaction {
	date: string;
	id: string;
	isHidden?: boolean;
	kind?: "transaction" | "yield";
}

export interface TransactionDisplayGroup<T extends DisplayableTransaction> {
	id: string;
	kind: "future" | "hidden" | "visible" | "yield";
	transactions: T[];
}

export function groupTransactionsForDisplay<T extends DisplayableTransaction>(
	transactions: T[],
	today: string,
): TransactionDisplayGroup<T>[] {
	const yields = transactions.filter(transaction => transaction.kind === "yield");
	const initialGroups: TransactionDisplayGroup<T>[] = yields.length
		? [{ id: `yield-${yields[0]!.date.slice(0, 10)}`, kind: "yield", transactions: yields }]
		: [];

	return transactions
		.filter(transaction => transaction.kind !== "yield")
		.reduce<TransactionDisplayGroup<T>[]>((groups, transaction) => {
			const kind =
				transaction.date.slice(0, 10) > today ? "future" : transaction.isHidden ? "hidden" : "visible";
			const previousGroup = groups.at(-1);

			if (previousGroup?.kind === kind) {
				previousGroup.transactions.push(transaction);
				return groups;
			}

			groups.push({ id: `${kind}-${transaction.id}`, kind, transactions: [transaction] });
			return groups;
		}, initialGroups);
}

export function sumYieldsByCurrency(entries: { amount: number; currency?: string }[]) {
	const totals = new Map<string, number>();
	for (const entry of entries) {
		const currency = entry.currency ?? "BRL";
		totals.set(currency, (totals.get(currency) ?? 0) + entry.amount);
	}
	return [...totals].map(([currency, amount]) => ({ amount, currency }));
}
