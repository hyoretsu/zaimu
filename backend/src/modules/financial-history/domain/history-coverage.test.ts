import { describe, expect, test } from "bun:test";
import { coverageWindow, summarizeCoverage } from "./history-coverage";

describe("administrative historical coverage", () => {
	test("defaults to 365 completed days", () => {
		expect(coverageWindow(undefined, undefined, new Date("2026-10-11T12:00:00Z"))).toEqual({
			endDate: "2026-10-10",
			requestedDays: 365,
			startDate: "2025-10-11",
		});
	});
	test("rejects invalid, reversed, future and oversized intervals", () => {
		const now = new Date("2026-10-11T12:00:00Z");
		for (const [start, end] of [
			["2026-02-30", "2026-03-01"],
			["2026-03-01", "2026-02-01"],
			["2026-10-10", "2026-10-11"],
			["2000-01-01", "2026-10-10"],
		])
			expect(() => coverageWindow(start, end, now)).toThrow();
	});
	test("saved publications win over verification and gaps stay contiguous", () => {
		const result = summarizeCoverage(
			"2026-10-01",
			"2026-10-07",
			new Set(["2026-10-03"]),
			new Set(["2026-10-03", "2026-10-04"]),
		);
		expect(result).toMatchObject({
			missingDays: 5,
			missingRanges: [
				{ endDate: "2026-10-02", startDate: "2026-10-01" },
				{ endDate: "2026-10-07", startDate: "2026-10-05" },
			],
			savedDays: 1,
			verifiedDays: 1,
		});
		expect(result.days[2]?.status).toBe("SAVED");
	});
	test("empty currency inventory remains missing, including weekends", () => {
		expect(summarizeCoverage("2026-10-10", "2026-10-11", new Set(), new Set())).toMatchObject({
			missingDays: 2,
			savedDays: 0,
			verifiedDays: 0,
		});
	});
});
