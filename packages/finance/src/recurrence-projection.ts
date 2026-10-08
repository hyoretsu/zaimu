import { type CreditBook, newBookPurchase } from "./credit-book";
import { roundMoney } from "./money";
import { type RecurrenceDefinition, recurrenceDates, recurrenceNeedsConfiguration } from "./recurrence";
export type RecurrenceMoneyConverter = (amount: number, from: string, to: string, date: string) => number;

/** Ephemeral copy only: forecasts never write purchases, rewards or debt events. */
export function projectRecurrenceCreditBook(
	book: CreditBook,
	recurrences: RecurrenceDefinition[],
	from: string,
	through: string,
	occurrences: Array<{ recurrenceId: string; date: string }> = [],
	convert?: RecurrenceMoneyConverter,
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
	const processed = new Set(occurrences.map(row => `${row.recurrenceId}:${row.date}`));
	for (const recurrence of recurrences) {
		if (
			!recurrence.isActive ||
			recurrenceNeedsConfiguration(recurrence) ||
			recurrence.creditCardId !== book.card.id
		)
			continue;
		for (const date of recurrenceDates(recurrence, from, through)) {
			if (processed.has(`${recurrence.id}:${date}`)) continue;
			const id = `forecast:${recurrence.id}:${date}`;
			const source = recurrence.currency ?? "BRL";
			const target = book.card.currency ?? "BRL";
			if (source !== target && !convert)
				throw new RangeError(`Conversão de ${source} para ${target} indisponível em ${date}`);
			const amount = roundMoney(
				source === target ? recurrence.amount : convert!(recurrence.amount, source, target, date),
				target,
			);
			if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Valor projetado inválido");
			if (recurrence.movement === "CARD_PAYMENT") {
				if (!projected.payments.some(payment => payment.id === id))
					projected.payments.push({ amount, date, id });
			} else if (
				recurrence.movement === "CARD_PURCHASE" &&
				!projected.purchases.some(
					purchase =>
						purchase.recurrenceId === recurrence.id && purchase.recurrenceOccurrenceDate === date,
				)
			)
				newBookPurchase(
					projected,
					{
						currency: source,
						description: recurrence.name,
						exchangeRate: recurrence.amount ? amount / recurrence.amount : 1,
						id,
						installments: recurrence.installments ?? 1,
						originalAmount: recurrence.amount,
						purchaseDate: date,
						recurrenceId: recurrence.id,
						recurrenceOccurrenceDate: date,
						storeName: recurrence.storeName ?? null,
						totalAmount: amount,
					},
					undefined,
					{ materialize: false },
				);
		}
	}
	return projected;
}
