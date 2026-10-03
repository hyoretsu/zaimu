import { expect, test } from "bun:test";
import { comparisonDuration, comparisonIntervals } from "./comparison-periods";

const date = (value: Date) =>
	`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

test("keeps default monthly comparison compatible", () => {
	const periods = comparisonIntervals(new Date(2026, 9, 15));
	expect(periods).toHaveLength(12);
	expect(date(periods[0]!.start)).toBe("2026-09-01");
	expect(date(periods[11]!.end)).toBe("2027-08-31");
});

test("compares two-week intervals from a complete date without gaps", () => {
	const periods = comparisonIntervals(new Date(2026, 9, 3), {
		comparisonSize: 2,
		comparisonUnit: "WEEK",
		periodsAfter: 1,
		periodsBefore: 2,
	});
	expect(periods.map(({ start, end }) => [date(start), date(end)])).toEqual([
		["2026-09-05", "2026-09-18"],
		["2026-09-19", "2026-10-02"],
		["2026-10-03", "2026-10-16"],
		["2026-10-17", "2026-10-30"],
	]);
	for (let i = 1; i < periods.length; i++)
		expect(periods[i]!.start.getTime() - periods[i - 1]!.end.getTime()).toBe(1);
});

test("supports quarters across years with no surrounding periods", () => {
	const [period] = comparisonIntervals(new Date(2026, 10, 15), {
		comparisonSize: 3,
		comparisonUnit: "MONTH",
		periodsAfter: 0,
		periodsBefore: 0,
	});
	expect(date(period!.start)).toBe("2026-11-15");
	expect(date(period!.end)).toBe("2027-02-14");
});

test("month-end anchors recover after shorter months", () => {
	const periods = comparisonIntervals(new Date(2026, 0, 31), {
		comparisonUnit: "MONTH",
		periodsAfter: 2,
		periodsBefore: 0,
	});
	expect(periods.map(({ start, end }) => [date(start), date(end)])).toEqual([
		["2026-01-31", "2026-02-27"],
		["2026-02-28", "2026-03-30"],
		["2026-03-31", "2026-04-29"],
	]);
});

test("annual comparison preserves leap-day anchor without drift", () => {
	const periods = comparisonIntervals(new Date(2024, 1, 29), {
		comparisonUnit: "YEAR",
		periodsAfter: 4,
		periodsBefore: 1,
	});
	expect(date(periods[0]!.start)).toBe("2023-02-28");
	expect(date(periods[1]!.start)).toBe("2024-02-29");
	expect(date(periods[5]!.start)).toBe("2028-02-29");
});

test("daily intervals remain contiguous over daylight saving changes", () => {
	const previous = process.env.TZ;
	process.env.TZ = "America/New_York";
	try {
		const periods = comparisonIntervals(new Date(2026, 2, 7), {
			comparisonUnit: "DAY",
			periodsAfter: 2,
			periodsBefore: 0,
		});
		expect(periods.map(({ start }) => date(start))).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
		for (let i = 1; i < periods.length; i++)
			expect(periods[i]!.start.getTime() - periods[i - 1]!.end.getTime()).toBe(1);
	} finally {
		if (previous === undefined) delete process.env.TZ;
		else process.env.TZ = previous;
	}
});

test("infers calendar months and years from a selected range", () => {
	expect(comparisonDuration(new Date(2026, 9, 1), new Date(2026, 9, 31))).toEqual({
		comparisonSize: 1,
		comparisonUnit: "MONTH",
	});
	expect(comparisonDuration(new Date(2026, 0, 1), new Date(2026, 2, 31))).toEqual({
		comparisonSize: 3,
		comparisonUnit: "MONTH",
	});
	expect(comparisonDuration(new Date(2024, 0, 1), new Date(2024, 11, 31))).toEqual({
		comparisonSize: 1,
		comparisonUnit: "YEAR",
	});
	expect(comparisonDuration(new Date(2026, 0, 31), new Date(2026, 1, 27))).toEqual({
		comparisonSize: 1,
		comparisonUnit: "MONTH",
	});
});

test("repeats an arbitrary selected range including both boundary days", () => {
	const start = new Date(2026, 9, 3);
	const end = new Date(2026, 9, 16);
	const duration = comparisonDuration(start, end);
	expect(duration).toEqual({ comparisonSize: 14, comparisonUnit: "DAY" });
	const periods = comparisonIntervals(start, { ...duration, periodsAfter: 1, periodsBefore: 1 });
	expect(periods.map(({ start, end }) => [date(start), date(end)])).toEqual([
		["2026-09-19", "2026-10-02"],
		["2026-10-03", "2026-10-16"],
		["2026-10-17", "2026-10-30"],
	]);
	expect(comparisonDuration(start, start)).toEqual({ comparisonSize: 1, comparisonUnit: "DAY" });
	expect(comparisonDuration(new Date(2025, 0, 1), new Date(2026, 1, 5))).toEqual({
		comparisonSize: 401,
		comparisonUnit: "DAY",
	});
});
