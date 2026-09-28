export function getPaidAmountsByCard(
	payments: Array<{ amount: number | string; paymentCreditCardId: string | null }>,
) {
	const paidByCard = new Map<string, number>();
	for (const payment of payments) {
		if (!payment.paymentCreditCardId) continue;
		paidByCard.set(
			payment.paymentCreditCardId,
			(paidByCard.get(payment.paymentCreditCardId) ?? 0) + Math.round(Number(payment.amount) * 100),
		);
	}
	return paidByCard;
}
