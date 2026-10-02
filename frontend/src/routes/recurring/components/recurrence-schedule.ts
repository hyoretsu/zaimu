import { formatLocalDate } from "@/lib/date";
import type { Recurrence } from "@/lib/recurrence";

export function getWeekdayLabel(dayOfWeek: number): string {
	return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" }).format(
		new Date(Date.UTC(2026, 8, 20 + dayOfWeek)),
	);
}

export function getRecurrenceScheduleSummary(
	unit: Recurrence["unit"],
	startDate: string,
	day: number | null,
	dayOfWeek?: number | null,
): string {
	switch (unit) {
		case "DAY":
			return "";
		case "MONTH":
			return day ? `dia ${day}` : "";
		case "WEEK":
			return dayOfWeek === null || dayOfWeek === undefined
				? formatLocalDate(startDate, { weekday: "long" })
				: getWeekdayLabel(dayOfWeek);
		case "YEAR":
			return formatLocalDate(startDate, { day: "2-digit", month: "2-digit" });
	}
}
