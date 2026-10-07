import { describe, expect, test } from "bun:test";
import {
	getNextRecurrenceDate,
	legacyRecurrenceSchedule,
	recurrenceDates,
	recurrenceNeedsConfiguration,
	validateRecurrenceInstallments,
} from "./recurrence";

describe("recurrence calendar", () => {
	test("restores original day after February", () => {
		expect(
			recurrenceDates(
				{ interval: 1, startDate: "2024-01-31", unit: "MONTH" },
				"2024-01-01",
				"2024-04-30",
			),
		).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]);
	});
	test("quarterly interval remains anchored when querying a later window", () => {
		expect(
			recurrenceDates(
				{ interval: 3, startDate: "2024-01-31", unit: "MONTH" },
				"2024-03-01",
				"2024-10-31",
			),
		).toEqual(["2024-04-30", "2024-07-31", "2024-10-31"]);
	});
	test("leap day returns in leap years", () => {
		expect(
			recurrenceDates(
				{ interval: 1, startDate: "2024-02-29", unit: "YEAR" },
				"2025-01-01",
				"2028-12-31",
			),
		).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
	});
	test("weekly weekday and inclusive bounds", () => {
		expect(
			recurrenceDates(
				{ dayOfWeek: 1, endDate: "2026-10-19", interval: 2, startDate: "2026-10-01", unit: "WEEK" },
				"2026-10-01",
				"2026-12-31",
			),
		).toEqual(["2026-10-05", "2026-10-19"]);
	});
	test("monthly selected day never precedes start", () => {
		expect(
			recurrenceDates(
				{ dayOfMonth: 5, interval: 2, startDate: "2026-10-20", unit: "MONTH" },
				"2026-10-01",
				"2027-02-05",
			),
		).toEqual(["2026-12-05", "2027-02-05"]);
	});
	test("daily custom interval", () => {
		expect(
			recurrenceDates(
				{ interval: 3, startDate: "2026-10-01", unit: "DAY" },
				"2026-10-04",
				"2026-10-10",
			),
		).toEqual(["2026-10-04", "2026-10-07", "2026-10-10"]);
	});
	test("rejects malformed calendars", () => {
		for (const interval of [0, -1, 1.5, Number.POSITIVE_INFINITY])
			expect(() =>
				recurrenceDates(
					{ interval, startDate: "2026-10-01", unit: "DAY" },
					"2026-10-01",
					"2026-10-02",
				),
			).toThrow();
		expect(() =>
			recurrenceDates(
				{ interval: 1, startDate: "2026-02-30", unit: "DAY" },
				"2026-10-01",
				"2026-10-02",
			),
		).toThrow();
	});
	test("legacy biweekly means fourteen days", () => {
		expect(legacyRecurrenceSchedule("BIWEEKLY", "2026-10-01")).toMatchObject({
			interval: 2,
			unit: "WEEK",
		});
	});
	test("transfer needs two different accounts", () => {
		expect(
			recurrenceNeedsConfiguration({
				destinationFinancialAccountId: "a",
				movement: "TRANSFER",
				originFinancialAccountId: "a",
			}),
		).toBe(true);
		expect(
			recurrenceNeedsConfiguration({
				destinationFinancialAccountId: "b",
				movement: "TRANSFER",
				originFinancialAccountId: "a",
			}),
		).toBe(false);
	});
});

test("installments accept legacy defaults and only card purchases may be split", () => {
	expect(() => validateRecurrenceInstallments({ movement: "CARD_PURCHASE" })).not.toThrow();
	for (const installments of [1, 12, 48])
		expect(() =>
			validateRecurrenceInstallments({ installments, movement: "CARD_PURCHASE" }),
		).not.toThrow();
	for (const installments of [0, -1, 1.5, 49, Number.NaN, Number.POSITIVE_INFINITY])
		expect(() => validateRecurrenceInstallments({ installments, movement: "CARD_PURCHASE" })).toThrow();
	for (const movement of ["INCOME", "EXPENSE", "TRANSFER", "CARD_PAYMENT"] as const) {
		expect(() => validateRecurrenceInstallments({ installments: 1, movement })).not.toThrow();
		expect(() => validateRecurrenceInstallments({ installments: 2, movement })).toThrow();
	}
});

test("advance selects tomorrow or next scheduled date and respects schedule end", () => {
	const schedule = { interval: 1, startDate: "2026-01-31", unit: "MONTH" as const };
	expect(getNextRecurrenceDate(schedule, "2026-02-28")).toBe("2026-03-31");
	expect(getNextRecurrenceDate({ ...schedule, endDate: "2026-03-30" }, "2026-02-28")).toBeUndefined();
	expect(getNextRecurrenceDate({ interval: 1, startDate: "2026-10-02", unit: "DAY" }, "2026-10-02")).toBe(
		"2026-10-03",
	);
});
