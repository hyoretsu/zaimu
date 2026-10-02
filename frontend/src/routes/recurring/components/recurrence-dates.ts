import { isBefore, parseISO, startOfDay } from "date-fns";

export function isRecurrenceEnded(endDate?: string | null, today = new Date()): boolean {
	if (!endDate) return false;

	return isBefore(startOfDay(parseISO(endDate)), startOfDay(today));
}
