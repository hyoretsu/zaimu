import { describe, expect, test } from "bun:test";
import { getPastRecurrenceDates, isRecurrenceEnded } from "./recurrence-dates";

describe("getPastRecurrenceDates", () => {
	test("returns each past monthly occurrence and excludes today", () => {
		expect(getPastRecurrenceDates("MONTHLY", "2026-01-04", 3, new Date("2026-08-28T12:00:00"))).toEqual([
			"2026-01-03",
			"2026-02-03",
			"2026-03-03",
			"2026-04-03",
			"2026-05-03",
			"2026-06-03",
			"2026-07-03",
			"2026-08-03",
		]);
	});

	test("returns no dates when recurrence starts today", () => {
		expect(getPastRecurrenceDates("DAILY", "2026-08-28", undefined, new Date("2026-08-28T12:00:00"))).toEqual(
			[],
		);
	});

	test("anchors weekly and fortnightly schedules to the start date, ignoring monthly day", () => {
		expect(getPastRecurrenceDates("WEEKLY", "2026-09-04", 20, new Date("2026-09-26T12:00:00"))).toEqual([
			"2026-09-04",
			"2026-09-11",
			"2026-09-18",
			"2026-09-25",
		]);
		expect(getPastRecurrenceDates("BIWEEKLY", "2026-09-04", 20, new Date("2026-10-03T12:00:00"))).toEqual([
			"2026-09-04",
			"2026-09-18",
			"2026-10-02",
		]);
	});

	test("clamps monthly payments to the last valid day without drifting", () => {
		expect(getPastRecurrenceDates("MONTHLY", "2026-01-31", 31, new Date("2026-04-01T12:00:00"))).toEqual([
			"2026-01-31",
			"2026-02-28",
			"2026-03-31",
		]);
	});

	test("keeps the annual start date, restoring February 29 in leap years", () => {
		expect(
			getPastRecurrenceDates("YEARLY", "2024-02-29", undefined, new Date("2029-01-01T12:00:00")),
		).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
	});

	test("stops at the optional end date", () => {
		expect(
			getPastRecurrenceDates("MONTHLY", "2026-01-04", 3, new Date("2026-08-28T12:00:00"), "2026-03-03"),
		).toEqual(["2026-01-03", "2026-02-03", "2026-03-03"]);
	});

	test("marks a recurrence as ended only after its end date", () => {
		const today = new Date("2026-08-29T12:00:00");

		expect(isRecurrenceEnded("2026-08-28", today)).toBe(true);
		expect(isRecurrenceEnded("2026-08-29", today)).toBe(false);
		expect(isRecurrenceEnded(undefined, today)).toBe(false);
	});
});
