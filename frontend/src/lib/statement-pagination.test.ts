import { describe, expect, test } from "bun:test";
import { statementPagination } from "./statement-pagination";

describe("statementPagination", () => {
	test("shows everything once no stream has more pages", () => {
		const result = statementPagination([
			{ dates: ["2026-04-01"], hasMore: false },
			{ dates: ["2026-05-10"], hasMore: false },
		]);
		expect(result.isVisible("2026-01-01")).toBe(true);
		expect(result.blocking).toEqual([]);
	});

	test("hides entries beyond the oldest date of a stream that still has more", () => {
		const result = statementPagination([
			{ dates: ["2026-05-20", "2026-04-02"], hasMore: false },
			{ dates: ["2026-11-01", "2026-05-15"], hasMore: true },
		]);
		expect(result.isVisible("2026-05-20")).toBe(true);
		expect(result.isVisible("2026-05-15")).toBe(false);
		expect(result.isVisible("2026-04-02")).toBe(false);
		expect(result.blocking).toEqual([1]);
	});

	test("loads only the stream that limits the horizon", () => {
		const result = statementPagination([
			{ dates: ["2026-06-01"], hasMore: true },
			{ dates: ["2026-08-01"], hasMore: true },
		]);
		expect(result.blocking).toEqual([1]);
	});
});
