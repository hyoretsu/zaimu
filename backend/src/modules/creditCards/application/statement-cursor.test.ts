import { describe, expect, test } from "bun:test";
import { decodeStatementCursor, encodeStatementCursor } from "./statement-cursor";

describe("statement cursor", () => {
	test("round-trips a cursor bound to its filter", () => {
		const cursor = {
			filter: "unpaid" as const,
			id: "statement-2",
			statementDate: "2026-09-10T00:00:00.000Z",
		};
		expect(decodeStatementCursor(encodeStatementCursor(cursor), false)).toEqual(cursor);
	});

	test("rejects a cursor reused with another filter", () => {
		const cursor = encodeStatementCursor({
			filter: "paid",
			id: "statement-2",
			statementDate: "2026-09-10T00:00:00.000Z",
		});
		expect(() => decodeStatementCursor(cursor, false)).toThrow("Cursor inválido para este filtro");
	});

	test("rejects malformed cursors", () => {
		expect(() => decodeStatementCursor("invalid", undefined)).toThrow("Cursor inválido para este filtro");
	});
});
