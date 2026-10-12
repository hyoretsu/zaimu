import { expect, test } from "bun:test";
import { coverageGaps, financialCoverageWindow, uncoveredRanges } from "./financial-coverage";

test("coverage windows allow future projections but reject invalid and reversed dates", () => {
	expect(financialCoverageWindow("2027-01-01", "2027-12-31")).toEqual({
		endDate: "2027-12-31",
		startDate: "2027-01-01",
	});
	for (const [start, end] of [
		["2026-02-30", "2026-03-01"],
		["2026-03-01", "2026-02-01"],
		["2000-01-01", "2050-01-01"],
	])
		expect(() => financialCoverageWindow(start, end)).toThrow();
});

test("temporal coverage distinguishes open boundaries, gaps and disjoint periods", () => {
	expect(coverageGaps("2026-01-01", "2026-12-31", null, null)).toEqual([]);
	expect(coverageGaps("2026-01-01", "2026-12-31", "2026-03-01", "2026-10-31")).toEqual([
		{ endDate: "2026-02-28", startDate: "2026-01-01" },
		{ endDate: "2026-12-31", startDate: "2026-11-01" },
	]);
	expect(coverageGaps("2026-01-01", "2026-12-31", "2027-01-01", null)).toEqual([
		{ endDate: "2026-12-31", startDate: "2026-01-01" },
	]);
});

test("adjacent versions cover a timeline together and preserve true gaps", () => {
	expect(
		uncoveredRanges("2026-01-01", "2026-12-31", [
			{ endDate: null, startDate: "2026-04-01" },
			{ endDate: "2026-03-31", startDate: null },
		]),
	).toEqual([]);
	expect(
		uncoveredRanges("2026-01-01", "2026-12-31", [
			{ endDate: null, startDate: "2026-04-01" },
			{ endDate: "2026-02-28", startDate: null },
		]),
	).toEqual([{ endDate: "2026-03-31", startDate: "2026-03-01" }]);
});
