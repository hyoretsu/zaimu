export function transactionPageDates(
	dates: string[],
	filters: { cursor?: string; startDate?: string; endDate?: string },
) {
	const selectedDate =
		!filters.cursor && filters.startDate && filters.startDate === filters.endDate
			? filters.startDate
			: undefined;
	return [...new Set([...dates, ...(selectedDate ? [selectedDate] : [])])].toSorted((a, b) =>
		b.localeCompare(a),
	);
}
