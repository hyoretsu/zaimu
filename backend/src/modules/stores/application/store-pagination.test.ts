import { expect, test } from "bun:test";
import { decodeStoreCursor, storeFilterHash, storePage } from "./store-pagination";

test("store cursor preserves name ties and terminates at last page", () => {
	const hash = storeFilterHash("owner", "jose");
	const rows = [
		{ id: "a", name: "São José" },
		{ id: "b", name: "São José" },
	];
	const first = storePage(rows, 1, hash);
	expect(decodeStoreCursor(first.nextCursor!, hash)).toEqual(rows[0]);
	expect(storePage(rows.slice(1), 1, hash)).toEqual({ hasMore: false, items: [rows[1]], nextCursor: null });
});
test("store cursor cannot cross owners or search filters", () => {
	const hash = storeFilterHash("owner", "jose");
	const cursor = storePage(
		[
			{ id: "a", name: "a" },
			{ id: "b", name: "b" },
		],
		1,
		hash,
	).nextCursor!;
	for (const other of [storeFilterHash("peer", "jose"), storeFilterHash("owner", "other")]) {
		expect(() => decodeStoreCursor(cursor, other)).toThrow("Cursor inválido");
	}
	expect(() => decodeStoreCursor("broken", hash)).toThrow("Cursor inválido");
});
