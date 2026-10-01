import {
	decodePaginationCursor,
	encodePaginationCursor,
	paginationFilterHash,
} from "~/shared/application/pagination-cursor";

interface CatalogCursor {
	id: string;
	name: string;
}
const isCatalogCursor = (value: unknown): value is CatalogCursor => {
	if (!value || typeof value !== "object") return false;
	const row = value as Record<string, unknown>;
	return typeof row.id === "string" && row.id.length > 0 && typeof row.name === "string";
};
export const catalogFilterHash = (userId: string, domain: string, search: string) =>
	paginationFilterHash(userId, { domain, search });
export const decodeCatalogCursor = (cursor: string | undefined, hash: string) =>
	decodePaginationCursor(cursor, hash, isCatalogCursor);
export function catalogPage<Item extends CatalogCursor>(rows: Item[], limit: number, hash: string) {
	const items = rows.slice(0, limit);
	const hasMore = rows.length > limit;
	const last = items.at(-1);
	return {
		hasMore,
		items,
		nextCursor:
			hasMore && last
				? encodePaginationCursor({ filterHash: hash, value: { id: last.id, name: last.name } })
				: null,
	};
}
