import type { CreditBook } from "@zaimu/finance/credit-book";
import type { RecurrenceDefinition } from "@zaimu/finance/recurrence";
import { projectRecurrenceCreditBook } from "@zaimu/finance/recurrence-projection";
import { guestDashboardCurrencyContext } from "./dashboard-currency-context";
import { getLocalDateKey } from "./date";

/** Public queued history supplies estimates; concrete purchases stay untouched. */
export async function projectGuestRecurrenceCreditBook(
	book: CreditBook,
	recurrences: RecurrenceDefinition[],
	from: string,
	through: string,
	occurrences: Array<{ recurrenceId: string; date: string }> = [],
) {
	const relevant = recurrences.filter(row => row.creditCardId === book.card.id && row.isActive);
	const currency = book.card.currency ?? "BRL";
	const money = await guestDashboardCurrencyContext({
		currency,
		forecastCurrencies: relevant.map(row => row.currency ?? "BRL"),
		forecasting: through > getLocalDateKey(),
		nativeCurrencies: [],
		positions: [],
		reference: getLocalDateKey(),
	});
	return projectRecurrenceCreditBook(
		book,
		relevant,
		from,
		through,
		occurrences,
		(amount, source, target, date) => (amount * money.factor(source, date)) / money.factor(target, date),
	);
}
