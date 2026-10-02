import { expect, test } from "bun:test";
import { localCursorPage } from "./local-cursor-page";

const rows = [
	{ date: "2026-10-02", id: "c" },
	{ date: "2026-10-01", id: "b" },
	{ date: "2026-10-01", id: "a" },
	{ date: "", id: "null" },
];
const position = (row: (typeof rows)[number]) => [row.date, row.id];
test("keyset preserves ties and null dates after insertion or removal before cursor", () => {
	const first = localCursorPage(rows, "José", { domain: "events", id: "pessoa" }, position, { limit: 2 });
	expect(first.items.map(row => row.id)).toEqual(["c", "b"]);
	const next = localCursorPage(
		[{ date: "2026-10-03", id: "new" }, ...rows.slice(1)],
		"José",
		{ domain: "events", id: "pessoa" },
		position,
		{ cursor: first.nextCursor, limit: 2 },
	);
	expect(next.items.map(row => row.id)).toEqual(["a", "null"]);
	expect(next.hasMore).toBe(false);
	expect(next.nextCursor).toBeNull();
});
test("rejects changed owner, domain, filter and malformed cursors", () => {
	const cursor = localCursorPage(rows, "owner", { domain: "history", id: "one" }, position, {
		limit: 1,
	}).nextCursor;
	expect(() =>
		localCursorPage(rows, "other", { domain: "history", id: "one" }, position, { cursor }),
	).toThrow();
	expect(() =>
		localCursorPage(rows, "owner", { domain: "events", id: "one" }, position, { cursor }),
	).toThrow();
	expect(() =>
		localCursorPage(rows, "owner", { domain: "history", id: "two" }, position, { cursor }),
	).toThrow();
	expect(() => localCursorPage(rows, "owner", {}, position, { cursor: "1" })).toThrow();
	expect(() => localCursorPage(rows, "owner", {}, position, { limit: 0 })).toThrow();
});
