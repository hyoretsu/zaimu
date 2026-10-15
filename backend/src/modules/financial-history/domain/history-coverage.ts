import { dateKey, shiftDay, windowDays } from "./collection";

export function coverageWindow(start?: string, end?: string, now = new Date()) {
	const today = dateKey(now);
	const startDate = dateKey(start ?? shiftDay(today, -365));
	const endDate = dateKey(end ?? shiftDay(today, -1));
	const requestedDays = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
	if (requestedDays < 1 || endDate >= today)
		throw new RangeError("Selecione um intervalo válido, anterior ao dia atual");
	return { endDate, requestedDays, startDate };
}

export function summarizeCoverage(
	start: string,
	end: string,
	saved: ReadonlySet<string>,
	verified: ReadonlySet<string>,
) {
	const missingRanges: { startDate: string; endDate: string }[] = [];
	let missingRange: (typeof missingRanges)[number] | undefined;
	const days = windowDays(start, end).map(date => {
		const status = saved.has(date)
			? ("SAVED" as const)
			: verified.has(date)
				? ("VERIFIED_NO_PUBLICATION" as const)
				: ("MISSING" as const);
		if (status === "MISSING") {
			if (missingRange) missingRange.endDate = date;
			else {
				missingRange = { endDate: date, startDate: date };
				missingRanges.push(missingRange);
			}
		} else missingRange = undefined;
		return { date, status };
	});
	return {
		days,
		missingDays: days.filter(day => day.status === "MISSING").length,
		missingRanges,
		savedDays: days.filter(day => day.status === "SAVED").length,
		verifiedDays: days.filter(day => day.status === "VERIFIED_NO_PUBLICATION").length,
	};
}
