import { expect, test } from "bun:test";
import { localCatalogPage } from "./catalog-pagination";

const rows = [
	{ id: "a", name: "São José", userId: "owner" },
	{ id: "b", name: "São José", userId: "owner" },
	{ id: "z", name: "São José", userId: "peer" },
	{ id: "c", name: "Outra loja", userId: "owner" },
];
test("guest search matches substring without case or accents and paginates ties", () => {
	const first = localCatalogPage(rows, "owner", "stores", { limit: 1, search: "JOSE" });
	expect(first.items.map(row => row.id)).toEqual(["a"]);
	expect(first.hasMore).toBe(true);
	const last = localCatalogPage(rows, "owner", "stores", {
		cursor: first.nextCursor!,
		limit: 1,
		search: "JOSE",
	});
	expect(last.items.map(row => row.id)).toEqual(["b"]);
	expect(last.nextCursor).toBeNull();
});
test("guest cursors reject a different search, owner and malformed values", () => {
	const cursor = localCatalogPage(rows, "owner", "stores", { limit: 1 }).nextCursor!;
	expect(() => localCatalogPage(rows, "owner", "stores", { cursor, search: "other" })).toThrow(
		"Cursor inválido",
	);
	expect(() => localCatalogPage(rows, "peer", "stores", { cursor })).toThrow("Cursor inválido");
	expect(() => localCatalogPage(rows, "owner", "stores", { cursor: "broken" })).toThrow("Cursor inválido");
});
test("an insertion before cursor does not duplicate a guest row", () => {
	const cursor = localCatalogPage(rows, "owner", "stores", { limit: 1 }).nextCursor!;
	const page = localCatalogPage(
		[...rows, { id: "new", name: "A loja", userId: "owner" }],
		"owner",
		"stores",
		{ cursor },
	);
	expect(page.items.map(row => row.id)).toEqual(["a", "b"]);
});

test("guest cursors cannot cross catalog domains", () => {
	const cursor = localCatalogPage(rows, "owner", "stores", { limit: 1 }).nextCursor!;
	expect(() => localCatalogPage(rows, "owner", "categories", { cursor })).toThrow("Cursor inválido");
});
