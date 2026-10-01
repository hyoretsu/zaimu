import type { Store, StorePage } from "./api";

export interface StorePageOptions {
	cursor?: string;
	limit?: number;
	search?: string;
}
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
const compare = (left: string, right: string) => {
	const a = new TextEncoder().encode(left);
	const b = new TextEncoder().encode(right);
	for (let index = 0; index < Math.min(a.length, b.length); index++)
		if (a[index] !== b[index]) return a[index] - b[index];
	return a.length - b.length;
};
export function localStorePage(rows: Store[], owner: string, options: StorePageOptions = {}): StorePage {
	const search = options.search?.trim() ?? "";
	const limit = options.limit ?? 50;
	if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limite inválido");
	const filter = JSON.stringify({ owner, search });
	let cursor: { id: string; name: string } | undefined;
	if (options.cursor) {
		try {
			const parsed = JSON.parse(decodeURIComponent(atob(options.cursor)));
			if (parsed.filter !== filter || typeof parsed.id !== "string" || typeof parsed.name !== "string")
				throw new Error();
			cursor = parsed;
		} catch {
			throw new Error("Cursor inválido para estes filtros");
		}
	}
	const sorted = rows
		.filter(row => row.userId === owner && normalize(row.name).includes(normalize(search)))
		.filter(
			row =>
				!cursor ||
				compare(row.name, cursor.name) > 0 ||
				(row.name === cursor.name && compare(row.id, cursor.id) > 0),
		)
		.toSorted((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
	const items = sorted.slice(0, limit);
	const hasMore = sorted.length > limit;
	const last = items.at(-1);
	return {
		hasMore,
		items,
		nextCursor:
			hasMore && last
				? btoa(encodeURIComponent(JSON.stringify({ filter, id: last.id, name: last.name })))
				: null,
	};
}
