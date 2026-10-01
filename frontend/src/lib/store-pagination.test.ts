import { expect, test } from "bun:test";
import { localStorePage } from "./store-pagination";

const rows = [
	{ id: "a", name: "São José", userId: "owner" },
	{ id: "b", name: "São José", userId: "owner" },
	{ id: "z", name: "São José", userId: "peer" },
	{ id: "c", name: "Outra loja", userId: "owner" },
];
test("guest search matches substring without case or accents and paginates ties", () => {
	const first = localStorePage(rows, "owner", { limit: 1, search: "JOSE" });
	expect(first.items.map(row => row.id)).toEqual(["a"]);
	expect(first.hasMore).toBe(true);
	const last = localStorePage(rows, "owner", { cursor: first.nextCursor!, limit: 1, search: "JOSE" });
	expect(last.items.map(row => row.id)).toEqual(["b"]);
	expect(last.nextCursor).toBeNull();
});
test("guest cursors reject a different search, owner and malformed values", () => {
	const cursor = localStorePage(rows, "owner", { limit: 1 }).nextCursor!;
	expect(() => localStorePage(rows, "owner", { cursor, search: "other" })).toThrow("Cursor inválido");
	expect(() => localStorePage(rows, "peer", { cursor })).toThrow("Cursor inválido");
	expect(() => localStorePage(rows, "owner", { cursor: "broken" })).toThrow("Cursor inválido");
});
test("an insertion before cursor does not duplicate a guest row", () => {
	const cursor = localStorePage(rows, "owner", { limit: 1 }).nextCursor!;
	const page = localStorePage([...rows, { id: "new", name: "A loja", userId: "owner" }], "owner", { cursor });
	expect(page.items.map(row => row.id)).toEqual(["a", "b"]);
});
