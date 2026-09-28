const toCents = (amount: number | string) => Math.round(Number(amount) * 100);

export function applyStatementCredits<
	T extends { id: string; paidAmount: number | string; statementDate: Date; totalAmount: number | string },
>(statements: T[]): Array<T & { balanceAmount: number; isPaid: boolean; paidAmount: number }> {
	let credit = statements.reduce((sum, statement) => sum + toCents(statement.paidAmount), 0);
	const effective = new Map<string, { balanceAmount: number; isPaid: boolean; paidAmount: number }>();
	const chronological = statements.toSorted(
		(left, right) =>
			left.statementDate.getTime() - right.statementDate.getTime() || left.id.localeCompare(right.id),
	);
	for (const [index, statement] of chronological.entries()) {
		const total = toCents(statement.totalAmount);
		const applied = Math.min(Math.max(0, total), Math.max(0, credit));
		credit -= applied;
		if (total < 0) credit -= total;
		const remainder = index === chronological.length - 1 ? Math.max(0, credit) : 0;
		const balance = Math.max(0, total - applied) - remainder;
		effective.set(statement.id, {
			balanceAmount: balance / 100,
			isPaid: balance <= 0 && (total !== 0 || applied > 0 || remainder > 0),
			paidAmount: (applied + remainder + Math.min(0, total)) / 100,
		});
	}
	return statements.map(statement => ({ ...statement, ...effective.get(statement.id)! }));
}
