import type { CreditBook } from "@zaimu/finance/credit-book";
import { shiftRecurrenceDate } from "@zaimu/finance/recurrence";
import { pendingRecurrenceDates, projectRecurrenceCreditBook } from "@zaimu/finance/recurrence-projection";
import { getCurrencyHistoryEstimate } from "~/modules/financial-history/application/currency-history-estimate";
import { requestHistoryCollection } from "~/modules/financial-history/application/history-collections";
import { queryRaw } from "~/shared/infra/sql";
import { normalizeRecurrence, recurrenceToday } from "./recurrences";
export async function projectRecurringCreditBook(
	book: CreditBook,
	through = `${new Date().getFullYear() + 2}-12-31`,
) {
	const rows = await queryRaw(
		'SELECT * FROM "Recurrence" WHERE "userId"=$1 AND "creditCardId"=$2 AND "isActive"=true',
		[book.card.userId, book.card.id],
	);
	const occurrences = await queryRaw<{ recurrenceId: string; date: string }>(
		'SELECT occurrence."recurrenceId", occurrence."date"::text AS "date" FROM "RecurrenceOccurrence" occurrence JOIN "Recurrence" schedule ON schedule."id"=occurrence."recurrenceId" WHERE schedule."userId"=$1 AND schedule."creditCardId"=$2',
		[book.card.userId, book.card.id],
	);
	const recurrences = rows.map(normalizeRecurrence);
	const target = book.card.currency ?? "BRL";
	const from = shiftRecurrenceDate(recurrenceToday(), 1);
	const processed = new Set(occurrences.map(row => `${row.recurrenceId}:${row.date}`));
	const demanded = recurrences.filter(
		row => row.amount && pendingRecurrenceDates(row, from, through, processed).length,
	);
	const rates = new Map<string, number>();
	for (const source of new Set(demanded.map(row => row.currency ?? "BRL"))) {
		if (source === target) continue;
		const collection = await requestHistoryCollection("CURRENCY", [source, target], recurrenceToday());
		const estimate = collection ? await getCurrencyHistoryEstimate(collection.id, target) : null;
		const rate = estimate?.estimates.find(row => row.baseCurrency === source)?.rate;
		if (rate != null && rate > 0) rates.set(source, rate);
	}
	return projectRecurrenceCreditBook(
		book,
		recurrences,
		from,
		through,
		occurrences,
		(amount, source, _target, date) => {
			const rate = rates.get(source);
			if (rate == null)
				throw new RangeError(`Estimativa de ${source} para ${target} indisponível em ${date}`);
			return amount * rate;
		},
	);
}
