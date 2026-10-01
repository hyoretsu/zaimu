import {
	decodePaginationCursor,
	encodePaginationCursor,
	paginationFilterHash,
} from "~/shared/application/pagination-cursor";

interface StoreCursor {
	id: string;
	name: string;
}
const isStoreCursor = (value: unknown): value is StoreCursor => {
	if (!value || typeof value !== "object") return false;
	const row = value as Record<string, unknown>;
	return typeof row.id === "string" && row.id.length > 0 && typeof row.name === "string";
};
export const storeFilterHash = (userId: string, search: string) =>
	paginationFilterHash(userId, { domain: "stores", search });
export const decodeStoreCursor = (cursor: string | undefined, hash: string) =>
	decodePaginationCursor(cursor, hash, isStoreCursor);
export function storePage<Item extends StoreCursor>(rows: Item[], limit: number, hash: string) {
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
