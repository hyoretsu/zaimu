import { describe, expect, test } from "bun:test";
import { salaryOccurrenceDates } from "./materialize-salary-transactions";

describe("salaryOccurrenceDates", () => {
	test("creates one occurrence for each scheduled day through today", () => {
		expect(
			salaryOccurrenceDates("MONTHLY", new Date("2026-01-04"), 3, undefined, new Date("2026-08-28")),
		).toEqual([
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

	test("keeps the annual start date, restoring February 29 in leap years", () => {
		expect(
			salaryOccurrenceDates(
				"YEARLY",
				new Date("2024-02-29T12:00:00"),
				29,
				undefined,
				new Date("2028-03-01T12:00:00"),
			),
		).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
	});
});
