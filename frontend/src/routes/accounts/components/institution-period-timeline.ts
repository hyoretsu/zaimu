export interface TimelinePeriod {
	endDate?: string | null;
	key: string;
	profileId: string;
	startDate: string;
}

export interface DefaultGap {
	endDate: string | null;
	key: string;
	startDate: string | null;
}

const shiftDay = (date: string, days: number) => {
	const day = new Date(`${date.slice(0, 10)}T12:00:00Z`);
	day.setUTCDate(day.getUTCDate() + days);
	return day.toISOString().slice(0, 10);
};

export const dayBefore = (date: string) => shiftDay(date, -1);
export const dayAfter = (date: string) => shiftDay(date, 1);

/** Trims or splits every other period so that `anchor` owns the days it covers. */
export function carvePeriods<T extends TimelinePeriod>(rows: T[], anchorKey: string): T[] {
	const anchor = rows.find(row => row.key === anchorKey);
	if (!anchor?.startDate) return rows;
	const anchorStart = anchor.startDate;
	const anchorEnd = anchor.endDate || null;
	if (anchorEnd && anchorEnd < anchorStart) return rows;
	return rows.flatMap(row => {
		if (row.key === anchorKey || !row.startDate) return [row];
		const rowEnd = row.endDate || null;
		const overlaps =
			(anchorEnd === null || row.startDate <= anchorEnd) && (rowEnd === null || anchorStart <= rowEnd);
		if (!overlaps) return [row];
		const kept: T[] = [];
		const before = row.startDate < anchorStart;
		if (before) kept.push({ ...row, endDate: dayBefore(anchorStart) });
		if (anchorEnd !== null && (rowEnd === null || rowEnd > anchorEnd)) {
			kept.push({
				...row,
				endDate: rowEnd,
				key: before ? crypto.randomUUID() : row.key,
				startDate: dayAfter(anchorEnd),
			});
		}
		return kept;
	});
}

/** Stretches not covered by any explicit period: the default profile applies there. */
export function defaultGaps(rows: TimelinePeriod[]): DefaultGap[] {
	const sorted = rows
		.filter(row => row.startDate)
		.toSorted((a, b) => a.startDate.localeCompare(b.startDate));
	const gaps: DefaultGap[] = [];
	let cursor: string | null = null;
	for (const row of sorted) {
		if (cursor === null || cursor < row.startDate) {
			gaps.push({
				endDate: dayBefore(row.startDate),
				key: `default-${cursor ?? "start"}`,
				startDate: cursor,
			});
		}
		if (!row.endDate) return gaps;
		cursor = dayAfter(row.endDate);
	}
	gaps.push({ endDate: null, key: `default-${cursor ?? "start"}`, startDate: cursor });
	return gaps;
}
