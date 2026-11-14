import { businessNow } from "@zaimu/finance/time-zone";
import { format, subDays } from "date-fns";

export function yieldSchedulerClock(now = businessNow()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23",
		month: "2-digit",
		timeZone: "America/Recife",
		year: "numeric",
	}).formatToParts(now);
	const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
	const dateKey = `${values.year}-${values.month}-${values.day}`;
	return {
		date: new Date(`${dateKey}T12:00:00`),
		dateKey,
		hour: Number(values.hour),
	};
}

export function recentReferenceRateWindow(now = businessNow()) {
	const clock = yieldSchedulerClock(now);
	if (clock.hour < 6) return null;
	return {
		endDate: subDays(clock.date, 1),
		slot: `${clock.dateKey}:${clock.hour}`,
		startDate: subDays(clock.date, 30),
	};
}

export function completedYieldDate(now = businessNow()) {
	return format(subDays(yieldSchedulerClock(now).date, 1), "yyyy-MM-dd");
}
