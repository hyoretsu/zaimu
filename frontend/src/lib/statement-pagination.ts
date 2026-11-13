interface StatementStream {
	dates: readonly string[];
	hasMore: boolean;
}

/**
 * Transactions and yields are paginated by independent cursors. Entries older than the
 * oldest date loaded from a stream that still has more pages could be missing items of that
 * stream, so the list only shows dates strictly newer than the newest such boundary.
 */
export function statementPagination(streams: readonly StatementStream[]) {
	const pending = streams
		.filter(stream => stream.hasMore)
		.map(stream => ({
			oldest: stream.dates.reduce<string | null>((a, b) => (a && a < b ? a : b), null),
		}));
	const horizon = pending.reduce<string | null>(
		(newest, { oldest }) => (oldest !== null && (newest === null || oldest > newest) ? oldest : newest),
		null,
	);
	return {
		/** Streams (by index) that must load more to move the horizon back. */
		blocking: streams.flatMap((stream, index) => {
			if (!stream.hasMore) return [];
			const oldest = stream.dates.reduce<string | null>((a, b) => (a && a < b ? a : b), null);
			return horizon === null || oldest === null || oldest >= horizon ? [index] : [];
		}),
		isVisible: (date: string) => horizon === null || date > horizon,
	};
}
