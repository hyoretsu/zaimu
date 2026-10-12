import { describe, expect, test } from "bun:test";
import { nationalHolidays, officialCurrencyAssociations } from "./calendar-source";

describe("national calendar sources", () => {
	test("Brazil has movable national holidays, without state holidays", () => {
		const calendar = nationalHolidays("BR", 2026);
		expect(calendar.status).toBe("COMPLETE");
		expect(calendar.holidays.some(day => day.date === "2026-04-03")).toBe(true);
		expect(calendar.holidays.some(day => day.date === "2026-07-09")).toBe(false);
	});
	test("calendar year follows civil dates", () => {
		for (const code of ["BR", "US", "NZ"]) {
			const calendar = nationalHolidays(code, 2027);
			expect(calendar.holidays.every(day => day.date.startsWith("2027-"))).toBe(true);
			expect(calendar.holidays.some(day => day.date === "2027-01-01")).toBe(true);
		}
	});
	test("supported year without national events is complete", () => {
		expect(nationalHolidays("IL", 1900)).toEqual({ holidays: [], status: "COMPLETE" });
	});
	test("unsupported country never claims complete coverage", () => {
		expect(nationalHolidays("ZZ", 2026)).toEqual({ holidays: [], status: "UNAVAILABLE" });
	});
	test("CLDR preserves historical currency intervals", () => {
		const rows = officialCurrencyAssociations();
		expect(rows.find(row => row.countryCode === "BR" && row.currency === "BRL")?.effectiveFrom).toBe(
			"1994-07-01",
		);
		expect(rows.some(row => row.countryCode === "BR" && row.currency === "BRR" && row.effectiveUntil)).toBe(
			true,
		);
		expect(officialCurrencyAssociations("USD").some(row => row.countryCode === "US")).toBe(true);
	});
});
