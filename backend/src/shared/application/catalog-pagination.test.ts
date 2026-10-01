import { expect, test } from "bun:test";
import { catalogFilterHash, catalogPage, decodeCatalogCursor } from "~/shared/application/catalog-pagination";

test("store cursor preserves name ties and terminates at last page", () => {
	const hash = catalogFilterHash("owner", "stores", "jose");
	const rows = [
		{ id: "a", name: "São José" },
		{ id: "b", name: "São José" },
	];
	const first = catalogPage(rows, 1, hash);
	expect(decodeCatalogCursor(first.nextCursor!, hash)).toEqual(rows[0]);
	expect(catalogPage(rows.slice(1), 1, hash)).toEqual({ hasMore: false, items: [rows[1]], nextCursor: null });
});
test("store cursor cannot cross owners or search filters", () => {
	const hash = catalogFilterHash("owner", "stores", "jose");
	const cursor = catalogPage(
		[
			{ id: "a", name: "a" },
			{ id: "b", name: "b" },
		],
		1,
		hash,
	).nextCursor!;
	for (const other of [
		catalogFilterHash("peer", "stores", "jose"),
		catalogFilterHash("owner", "stores", "other"),
		catalogFilterHash("owner", "categories", "jose"),
	]) {
		expect(() => decodeCatalogCursor(cursor, other)).toThrow("Cursor inválido");
	}
	expect(() => decodeCatalogCursor("broken", hash)).toThrow("Cursor inválido");
});
