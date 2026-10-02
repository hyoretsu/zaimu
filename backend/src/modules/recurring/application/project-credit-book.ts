import type { CreditBook } from "@zaimu/finance/credit-book";
import { shiftRecurrenceDate } from "@zaimu/finance/recurrence";
import { projectRecurrenceCreditBook } from "@zaimu/finance/recurrence-projection";
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
	return projectRecurrenceCreditBook(
		book,
		rows.map(normalizeRecurrence),
		shiftRecurrenceDate(recurrenceToday(), 1),
		through,
		occurrences,
	);
}
