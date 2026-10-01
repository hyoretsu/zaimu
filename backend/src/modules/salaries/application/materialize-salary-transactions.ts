import { addDays, addWeeks, addYears, format, isAfter, startOfDay } from "date-fns";
import { materializeRecurrence } from "~/modules/recurring/application/recurrences";
import { queryRaw } from "~/shared/infra/sql";

type SalaryFrequency = "BIWEEKLY" | "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY";

export function salaryOccurrenceDates(
	frequency: SalaryFrequency,
	startDate: Date,
	payDay: number,
	endDate?: Date | null,
	today = new Date(),
	dayOfWeek?: number | null,
): string[] {
	const occurrences: string[] = [];
	const currentDay = startOfDay(today);
	const end = endDate ? startOfDay(endDate) : currentDay;
	const start = startOfDay(startDate);
	let monthOffset = 0;
	let yearOffset = 0;
	let occurrence = frequency === "MONTHLY" ? monthlyOccurrence(start, payDay) : start;
	if (frequency === "WEEKLY" && dayOfWeek !== null && dayOfWeek !== undefined)
		occurrence = addDays(start, (dayOfWeek - start.getDay() + 7) % 7);

	while (!isAfter(occurrence, currentDay) && !isAfter(occurrence, end)) {
		occurrences.push(format(occurrence, "yyyy-MM-dd"));
		switch (frequency) {
			case "DAILY":
				occurrence = addDays(occurrence, 1);
				break;
			case "WEEKLY":
				occurrence = addWeeks(occurrence, 1);
				break;
			case "BIWEEKLY":
				occurrence = addWeeks(occurrence, 2);
				break;
			case "MONTHLY":
				monthOffset += 1;
				occurrence = monthlyOccurrence(start, payDay, monthOffset);
				break;
			case "YEARLY":
				yearOffset += 1;
				occurrence = addYears(start, yearOffset);
				break;
		}
	}

	return occurrences;
}

function monthlyOccurrence(start: Date, payDay: number, monthOffset = 0): Date {
	const month = new Date(start.getFullYear(), start.getMonth() + monthOffset, 1);
	const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
	return new Date(month.getFullYear(), month.getMonth(), Math.min(payDay, lastDay));
}

/** Compatibility entrypoint; salary is a generic incoming recurrence. */
export async function materializeSalaryTransactions(asOf = new Date(), userId?: string) {
	const rows = await queryRaw<{ id: string; userId: string }>(
		`SELECT "id","userId" FROM "Recurrence" WHERE "movement"='INCOME' AND "isActive"=true${userId ? ' AND "userId"=$1' : ""}`,
		userId ? [userId] : [],
	);
	let transactions = 0;
	for (const row of rows)
		transactions += await materializeRecurrence(row.userId, row.id, format(asOf, "yyyy-MM-dd"));
	return { salaries: rows.length, transactions, userIds: [...new Set(rows.map(row => row.userId))] };
}
