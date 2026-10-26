import { type CreditBook, creditBookPlan, newBookPurchase, replayCreditBook } from "./credit-book";
import { roundMoney } from "./money";
import { recurrenceDates, type RecurrenceDefinition, recurrenceNeedsConfiguration } from "./recurrence";
export type RecurrenceMoneyConverter = (amount: number, from: string, to: string, date: string) => number;

/** Only unmaterialized occurrences inside the requested projection need conversion. */
export function pendingRecurrenceDates(
	recurrence: RecurrenceDefinition,
	from: string,
	through: string,
	processed: ReadonlySet<string> = new Set(),
) {
	if (!recurrence.isActive || recurrenceNeedsConfiguration(recurrence)) return [];
	return recurrenceDates(recurrence, from, through).filter(
		date => !processed.has(`${recurrence.id}:${date}`),
	);
}

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
		for (const date of pendingRecurrenceDates(recurrence, from, through, processed)) {
			const id = `forecast:${recurrence.id}:${date}`;
			const source = recurrence.currency ?? "BRL";
			const target = book.card.currency ?? "BRL";
			if (recurrence.amount && source !== target && !convert)
				throw new RangeError(`Conversão de ${source} para ${target} indisponível em ${date}`);
			const amount = roundMoney(
				!recurrence.amount || source === target
					? recurrence.amount
					: convert!(recurrence.amount, source, target, date),
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

/** Listing visibility comes from existing purchases, never recurring forecasts alone. */
export function listedRecurrenceStatements(book: CreditBook, projected: CreditBook, asOf?: string) {
	const purchaseStatements = new Set(creditBookPlan(book).installments.map(row => row.statementId));
	const actualStatements = new Map(replayCreditBook(book, asOf).statements.map(row => [row.id, row]));
	const outstandingStatements = new Set(
		[...actualStatements.values()].filter(row => row.balanceAmount !== 0).map(row => row.id),
	);
	return replayCreditBook(projected, asOf)
		.statements.filter(row => purchaseStatements.has(row.id) || outstandingStatements.has(row.id))
		.map(row => ({
			...row,
			actualInvoiceAmount: actualStatements.get(row.id)?.invoiceAmount ?? 0,
		}));
}
