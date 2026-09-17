import { describe, expect, test } from "bun:test";
import { formatDateRange } from "./date-range-label";

describe("date range label", () => {
	test("shows a single date for a one-day period", () => {
		expect(formatDateRange({ endDate: "2026-07-31", startDate: "2026-07-31" })).toBe("31 jul 2026");
	});

	test("keeps both boundaries for a multi-day period", () => {
		expect(formatDateRange({ endDate: "2026-07-31", startDate: "2026-07-30" })).toBe(
			"30 jul 2026 — 31 jul 2026",
		);
	});
});
