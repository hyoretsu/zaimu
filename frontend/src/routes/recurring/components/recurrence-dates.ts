import { addDays, addWeeks, addYears, format, isBefore, parseISO, startOfDay } from "date-fns";
import type { RecurrenceFrequency } from "./types";

export function getPastRecurrenceDates(
	frequency: RecurrenceFrequency,
	startDate: string,
	dayOfMonth?: number,
	today = new Date(),
	endDate?: string,
	dayOfWeek?: number,
): string[] {
	const dates: string[] = [];
	const cutoff = startOfDay(today);
	const start = startOfDay(parseISO(startDate));
	let occurrence = frequency === "MONTHLY" ? monthlyOccurrence(start, dayOfMonth) : start;
	if (frequency === "WEEKLY" && dayOfWeek !== undefined)
		occurrence = addDays(start, (dayOfWeek - start.getDay() + 7) % 7);
	let monthOffset = 0;
	let yearOffset = 0;

	const end = endDate ? startOfDay(parseISO(endDate)) : undefined;
	while (isBefore(occurrence, cutoff) && (!end || !isBefore(end, occurrence))) {
		dates.push(format(occurrence, "yyyy-MM-dd"));
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
				occurrence = monthlyOccurrence(start, dayOfMonth, monthOffset);
				break;
			case "YEARLY":
				yearOffset += 1;
				occurrence = addYears(start, yearOffset);
				break;
		}
	}

	return dates;
}

export function isRecurrenceEnded(endDate?: string | null, today = new Date()): boolean {
	if (!endDate) return false;

	return isBefore(startOfDay(parseISO(endDate)), startOfDay(today));
}

function monthlyOccurrence(start: Date, dayOfMonth?: number, monthOffset = 0): Date {
	if (!dayOfMonth) return new Date(start.getFullYear(), start.getMonth() + monthOffset, start.getDate());
	const month = new Date(start.getFullYear(), start.getMonth() + monthOffset, 1);
	const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
	return new Date(month.getFullYear(), month.getMonth(), Math.min(dayOfMonth, lastDay));
}
