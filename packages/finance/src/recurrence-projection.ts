import { type CreditBook, newBookPurchase } from "./credit-book";
import { type RecurrenceDefinition, recurrenceDates, recurrenceNeedsConfiguration } from "./recurrence";
/** Ephemeral copy only: forecasts never write purchases, rewards or debt events. */
export function projectRecurrenceCreditBook(
	book: CreditBook,
	recurrences: RecurrenceDefinition[],
	from: string,
	through: string,
) {
	const projected: CreditBook = {
		...book,
		card: { ...book.card },
		charges: [...book.charges],
		installments: [...book.installments],
		payments: [...book.payments],
		purchases: [...book.purchases],
		refunds: [...book.refunds],
		statements: [...book.statements],
	};
	for (const recurrence of recurrences) {
		if (
			!recurrence.isActive ||
			recurrenceNeedsConfiguration(recurrence) ||
			recurrence.creditCardId !== book.card.id
		)
			continue;
		for (const date of recurrenceDates(recurrence, from, through)) {
			const id = `forecast:${recurrence.id}:${date}`;
			if (recurrence.movement === "CARD_PAYMENT") {
				if (!projected.payments.some(payment => payment.id === id))
					projected.payments.push({ amount: recurrence.amount, date, id });
			} else if (
				recurrence.movement === "CARD_PURCHASE" &&
				!projected.purchases.some(
					purchase =>
						purchase.subscriptionId === recurrence.id &&
						purchase.subscriptionOccurrenceDate === date,
				)
			)
				newBookPurchase(
					projected,
					{
						description: recurrence.name,
						id,
						installments: 1,
						purchaseDate: date,
						storeName: recurrence.storeName ?? null,
						subscriptionId: recurrence.id,
						subscriptionOccurrenceDate: date,
						totalAmount: recurrence.amount,
					},
					undefined,
					{ materialize: false },
				);
		}
	}
	return projected;
}
