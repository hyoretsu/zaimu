export function getPaidAmountsByStatement(
	payments: Array<{ amount: number | string; creditCardStatementId: string | null }>,
) {
	const paidByStatement = new Map<string, number>();
	for (const payment of payments) {
		if (!payment.creditCardStatementId) continue;
		paidByStatement.set(
			payment.creditCardStatementId,
			(paidByStatement.get(payment.creditCardStatementId) ?? 0) + Math.round(Number(payment.amount) * 100),
		);
	}
	return paidByStatement;
}
