import { describe, expect, test } from "bun:test";
import { HttpException } from "~/shared/errors";
import { decodePaginationCursor, encodePaginationCursor, paginationFilterHash } from "./pagination-cursor";

const isCursorValue = (value: unknown): value is { date: string; id: string } => {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.date === "string" && typeof candidate.id === "string";
};

describe("pagination cursor", () => {
	test("round trips a cursor bound to user and filters", () => {
		const filterHash = paginationFilterHash("user-1", { limit: 50, search: "mercado" });
		const cursor = encodePaginationCursor({ filterHash, value: { date: "2026-09-26", id: "item-1" } });
		expect(decodePaginationCursor(cursor, filterHash, isCursorValue)).toEqual({
			date: "2026-09-26",
			id: "item-1",
		});
	});

	test("normalizes filter key order", () => {
		expect(paginationFilterHash("user-1", { limit: 50, search: "x" })).toBe(
			paginationFilterHash("user-1", { limit: 50, search: "x" }),
		);
	});

	test("rejects another user, filter or malformed payload", () => {
		const filterHash = paginationFilterHash("user-1", { search: "x" });
		const cursor = encodePaginationCursor({ filterHash, value: { date: "2026-09-26", id: "item-1" } });
		expect(() =>
			decodePaginationCursor(cursor, paginationFilterHash("user-2", { search: "x" }), isCursorValue),
		).toThrow(HttpException);
		expect(() => decodePaginationCursor("invalid", filterHash, isCursorValue)).toThrow(HttpException);
	});
});
