const toCents = (amount: number | string) => Math.round(Number(amount) * 100);

export function applyStatementCredits<
	T extends {
		id: string;
		isPaid: boolean;
		paidAmount: number | string;
		statementDate: Date;
		totalAmount: number | string;
	},
>(statements: T[]): Array<T & { balanceAmount: number }> {
	let carriedCreditInCents = 0;
	const effectiveById = new Map<string, { balanceAmount: number; isPaid: boolean }>();

	const chronologicalStatements = statements.toSorted(
		(left, right) => left.statementDate.getTime() - right.statementDate.getTime(),
	);
	for (const statement of chronologicalStatements) {
		const paidAmountInCents = toCents(statement.paidAmount);
		const appliedAmountInCents = paidAmountInCents + carriedCreditInCents;
		const rawBalanceInCents = toCents(statement.totalAmount) - appliedAmountInCents;
		const balanceAmount = (paidAmountInCents > 0 ? Math.max(0, rawBalanceInCents) : rawBalanceInCents) / 100;
		carriedCreditInCents = Math.max(0, -rawBalanceInCents);
		effectiveById.set(statement.id, {
			balanceAmount,
			isPaid: appliedAmountInCents > 0 && rawBalanceInCents <= 0,
		});
	}

	return statements.map(statement => ({ ...statement, ...effectiveById.get(statement.id)! }));
}
