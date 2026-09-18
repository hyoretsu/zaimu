import { formatLocalDate, parseLocalDate } from "@/lib/date";
import type { RecurrenceFrequency } from "./types";

export function getRecurrenceDay(
	frequency: RecurrenceFrequency,
	startDate: string,
	monthlyDay: string,
): number {
	return frequency === "MONTHLY" ? Number.parseInt(monthlyDay, 10) : parseLocalDate(startDate).getDate();
}

export function getRecurrenceScheduleDescription(frequency: RecurrenceFrequency, startDate: string): string {
	if (!startDate) return "Selecione a data inicial para definir quando a recorrência acontece.";
	const weekday = formatLocalDate(startDate, { weekday: "long" });
	switch (frequency) {
		case "DAILY":
			return "Repete todos os dias a partir desta data.";
		case "WEEKLY":
			return `Repete toda ${weekday} a partir desta data.`;
		case "BIWEEKLY":
			return `Repete a cada 14 dias a partir desta data (${weekday}).`;
		case "YEARLY":
			return `Repete todo ano em ${formatLocalDate(startDate, { day: "2-digit", month: "2-digit" })}.`;
		case "MONTHLY":
			return "";
	}
}

export function getRecurrenceScheduleSummary(
	frequency: RecurrenceFrequency,
	startDate: string,
	day: number | null,
): string {
	switch (frequency) {
		case "DAILY":
			return "";
		case "MONTHLY":
			return day ? `dia ${day}` : "";
		case "WEEKLY":
		case "BIWEEKLY":
			return formatLocalDate(startDate, { weekday: "long" });
		case "YEARLY":
			return formatLocalDate(startDate, { day: "2-digit", month: "2-digit" });
	}
}
