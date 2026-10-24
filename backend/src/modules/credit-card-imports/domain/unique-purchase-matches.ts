/** Require one candidate and no competing imported item for the same purchase. */
export function uniquePurchaseMatches<T extends { id: string }>(
	duplicates: Map<string, T[]>,
	prefer?: (itemId: string, candidate: T) => boolean,
	preferDate?: (itemId: string, candidate: T) => boolean,
) {
	duplicates = new Map(
		[...duplicates].map(([itemId, candidates]) => {
			const preferred = candidates.filter(candidate => prefer?.(itemId, candidate));
			const compatible = preferred.length ? preferred : candidates;
			const sameDay = compatible.filter(candidate => preferDate?.(itemId, candidate));
			return [itemId, sameDay.length ? sameDay : compatible];
		}),
	);
	const claims = new Map<string, number>();
	for (const candidates of duplicates.values())
		for (const candidate of candidates) claims.set(candidate.id, (claims.get(candidate.id) ?? 0) + 1);
	return [...duplicates].flatMap(([itemId, candidates]): [string, T][] => {
		const candidate = candidates[0];
		return candidates.length === 1 &&
			candidate &&
			!candidate.id.startsWith("pending:") &&
			claims.get(candidate.id) === 1
			? [[itemId, candidate]]
			: [];
	});
}
