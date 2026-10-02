export interface LocalPageOptions {
	cursor?: string | null;
	limit?: number;
}
const stable = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([key, item]) => [key, stable(item)]),
		);
	return value;
};
const compare = (left: string[], right: string[]) => {
	for (let i = 0; i < left.length; i++) {
		if (left[i] < right[i]) return -1;
		if (left[i] > right[i]) return 1;
	}
	return 0;
};
/** Descending keyset page; position must end with a unique immutable ID. */
export function localCursorPage<Item>(
	rows: Item[],
	owner: string,
	filters: unknown,
	position: (item: Item) => string[],
	options: LocalPageOptions = {},
) {
	const limit = options.limit ?? 50;
	if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limite inválido");
	const filter = JSON.stringify(stable({ filters, owner }));
	let boundary: string[] | undefined;
	if (options.cursor) {
		try {
			const decoded = JSON.parse(decodeURIComponent(atob(options.cursor)));
			if (
				decoded.filter !== filter ||
				!Array.isArray(decoded.position) ||
				!decoded.position.length ||
				!decoded.position.every((item: unknown) => typeof item === "string")
			)
				throw new Error();
			boundary = decoded.position;
		} catch {
			throw new Error("Cursor inválido para estes filtros");
		}
	}
	const selected = rows
		.filter(row => !boundary || compare(position(row), boundary) < 0)
		.toSorted((a, b) => compare(position(b), position(a)))
		.slice(0, limit + 1);
	const items = selected.slice(0, limit),
		hasMore = selected.length > limit,
		last = items.at(-1);
	return {
		hasMore,
		items,
		nextCursor:
			hasMore && last ? btoa(encodeURIComponent(JSON.stringify({ filter, position: position(last) }))) : null,
	};
}
