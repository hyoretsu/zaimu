export type ComparisonUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";

export interface ComparisonOptions {
	comparisonUnit?: ComparisonUnit;
	comparisonSize?: number;
	periodsBefore?: number;
	periodsAfter?: number;
}

/** Calendar boundaries always derive from the original anchor, avoiding month-end drift. */
export function comparisonIntervals(reference: Date, options: ComparisonOptions = {}) {
	const unit = options.comparisonUnit ?? "MONTH";
	const size = options.comparisonSize ?? 1;
	const before = options.periodsBefore ?? 1;
	const after = options.periodsAfter ?? 10;
	const anchor = new Date(reference);
	anchor.setHours(0, 0, 0, 0);
	if (!options.comparisonUnit) anchor.setDate(1);
	const boundary = (offset: number) => {
		const date = new Date(anchor);
		if (unit === "DAY" || unit === "WEEK") {
			date.setDate(anchor.getDate() + offset * size * (unit === "WEEK" ? 7 : 1));
		} else {
			date.setDate(1);
			date.setMonth(anchor.getMonth() + offset * size * (unit === "YEAR" ? 12 : 1));
			const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
			date.setDate(Math.min(anchor.getDate(), lastDay));
		}
		return date;
	};
	return Array.from({ length: before + 1 + after }, (_, index) => {
		const offset = index - before;
		const end = boundary(offset + 1);
		end.setDate(end.getDate() - 1);
		end.setHours(23, 59, 59, 999);
		return { end, start: boundary(offset) };
	});
}

/** Complete calendar months retain their calendar duration; other ranges repeat their day count. */
export function comparisonDuration(
	start: Date,
	end: Date,
): Pick<ComparisonOptions, "comparisonSize" | "comparisonUnit"> {
	const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
	for (const size of [months, months - 1]) {
		if (size < 1) continue;
		const interval = comparisonIntervals(start, {
			comparisonSize: size,
			comparisonUnit: "MONTH",
			periodsAfter: 0,
			periodsBefore: 0,
		})[0]!;
		if (
			interval.end.getFullYear() === end.getFullYear() &&
			interval.end.getMonth() === end.getMonth() &&
			interval.end.getDate() === end.getDate()
		) {
			return size % 12 === 0
				? { comparisonSize: size / 12, comparisonUnit: "YEAR" }
				: { comparisonSize: size, comparisonUnit: "MONTH" };
		}
	}
	const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
	const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
	return { comparisonSize: Math.round((endDay - startDay) / 86_400_000) + 1, comparisonUnit: "DAY" };
}
