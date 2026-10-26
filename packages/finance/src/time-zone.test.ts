import { describe, expect, test } from "bun:test";
import { countryTimeZone, financialDateKey, isTimeZone, resolveTimeZone } from "./time-zone";

describe("financial timezone preferences", () => {
	test("defaults to the country's first national calendar zone, or GMT", () => {
		expect(countryTimeZone("BR")).toBe("America/Sao_Paulo");
		expect(countryTimeZone("US")).toBe("America/New_York");
		expect(countryTimeZone("JP")).toBe("Asia/Tokyo");
		for (const country of [null, undefined, "", "ZZ", "AQ"]) expect(countryTimeZone(country)).toBe("GMT");
	});

	test("keeps an explicit regional preference across country changes", () => {
		expect(resolveTimeZone("America/Rio_Branco", "BR")).toBe("America/Rio_Branco");
		expect(resolveTimeZone("America/Rio_Branco", "US")).toBe("America/Rio_Branco");
		expect(resolveTimeZone("GMT", "BR")).toBe("GMT");
		expect(resolveTimeZone(null, "BR")).toBe("America/Sao_Paulo");
		expect(resolveTimeZone(null, null)).toBe("GMT");
		expect(isTimeZone("Mars/Olympus")).toBe(false);
		expect(isTimeZone("")).toBe(false);
	});

	test("waits for regional midnight and observes daylight saving", () => {
		const now = new Date("2026-10-26T03:00:00Z");
		expect(financialDateKey(now, resolveTimeZone(null, "BR"))).toBe("2026-10-26");
		expect(financialDateKey(now, resolveTimeZone("America/Rio_Branco", "BR"))).toBe("2026-10-25");
		expect(financialDateKey(new Date("2026-10-26T05:00:00Z"), "America/Rio_Branco")).toBe("2026-10-26");
		expect(financialDateKey(new Date("2026-07-01T04:00:00Z"), "America/New_York")).toBe("2026-07-01");
		expect(financialDateKey(new Date("2026-12-01T04:00:00Z"), "America/New_York")).toBe("2026-11-30");
	});
});
