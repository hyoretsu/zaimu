import { addYears, endOfYear, startOfYear, subDays, subYears } from "date-fns";

export function referenceRateWindow(today: Date) {
	return { endDate: subDays(today, 1), startDate: subYears(today, 10) };
}

// Complete calendar years have stable keys; only the current-year tail moves.
export function referenceRateBootstrapIntervals(today: Date) {
	const window = referenceRateWindow(today);
	const intervals: { startDate: Date; endDate: Date }[] = [];
	for (let startDate = startOfYear(window.startDate); startDate <= window.endDate; ) {
		const endDate = new Date(Math.min(endOfYear(startDate).getTime(), window.endDate.getTime()));
		intervals.push({ endDate, startDate });
		startDate = addYears(startDate, 1);
	}
	return intervals;
}
