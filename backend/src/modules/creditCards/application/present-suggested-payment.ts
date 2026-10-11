type PaymentTransaction =
	typeof import("../infra/elysia/PaymentSuggestionsDTO").ConfirmPaymentSuggestionReturn.static.transaction;

export function presentSuggestedPayment(transaction: PaymentTransaction): PaymentTransaction {
	return {
		...transaction,
		amount: Number(transaction.amount),
		date: transaction.date instanceof Date ? transaction.date.toISOString().slice(0, 10) : transaction.date,
	};
}
