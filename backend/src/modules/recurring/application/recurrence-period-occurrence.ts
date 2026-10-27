import {
	recurrenceDateKey,
	type RecurrenceDefinition,
	recurrencePeriodRange,
} from "@zaimu/finance/recurrence";
import { queryRaw } from "~/shared/infra/sql";

/** Call while holding the recurrence lock, shared by association, generation and sync. */
export async function getRecurrencePeriodOccurrence(recurrence: RecurrenceDefinition, date: string | Date) {
	const period = recurrencePeriodRange(recurrence.unit, recurrenceDateKey(date));
	const [occurrence] = await queryRaw<{
		date: string;
		transactionId: string | null;
		purchaseId: string | null;
		deletedAt: unknown;
	}>(
		'SELECT "date"::text AS "date", "transactionId", "purchaseId", "deletedAt" FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1 AND "date">=$2::date AND "date"<=$3::date ORDER BY "date" LIMIT 1',
		[recurrence.id, period.from, period.through],
	);
	return occurrence;
}
