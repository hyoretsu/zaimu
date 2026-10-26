import { describe, expect, test } from "bun:test";
import { countryCodes } from "@zaimu/finance/country-codes";
import { countryTimeZone } from "@zaimu/finance/time-zone";
import Holidays from "date-holidays";
import { financialDate } from "./financial-date";

describe("financial schedule date", () => {
	test("keeps Brazilian occurrences pending after UTC midnight", () => {
		expect(financialDate(new Date("2026-10-26T01:21:00Z"), "BR")).toBe("2026-10-25");
		expect(financialDate(new Date("2026-10-26T02:59:59.999Z"), "BR")).toBe("2026-10-25");
		expect(financialDate(new Date("2026-10-26T03:00:00Z"), "BR")).toBe("2026-10-26");
	});

	test("uses each country's civil date rather than the worker timezone", () => {
		const now = new Date("2026-10-25T16:00:00Z");
		expect(financialDate(now, "JP")).toBe("2026-10-26");
		expect(financialDate(now, "BR")).toBe("2026-10-25");
	});

	test("observes daylight saving in the selected country's primary zone", () => {
		expect(financialDate(new Date("2026-07-01T04:00:00Z"), "US")).toBe("2026-07-01");
		expect(financialDate(new Date("2026-12-01T04:00:00Z"), "US")).toBe("2026-11-30");
	});

	test("uses GMT when country preference is missing or unsupported", () => {
		const now = new Date("2026-10-26T01:21:00Z");
		expect(financialDate(now)).toBe("2026-10-26");
		expect(financialDate(now, "ZZ")).toBe("2026-10-26");
	});
});

test("shared defaults match every national calendar's first timezone", () => {
	for (const country of countryCodes)
		expect(countryTimeZone(country)).toBe(new Holidays(country).getTimezones()[0] ?? "GMT");
});
