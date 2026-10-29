import { expect, test } from "bun:test";
import { performanceClockEvidence } from "./preflight";

test("official captures reject a database clock different from the application reference", () => {
	for (const date of ["2026-10-03", "2026-10-05", "2027-10-04"])
		expect(() => performanceClockEvidence(date)).toThrow("fixed-clock acceptance unavailable");
	expect(performanceClockEvidence("2026-10-04")).toEqual({
		applicationDate: "2026-10-04",
		consistent: true,
		databaseDate: "2026-10-04",
	});
});

test("diagnostic captures expose divergent clocks rather than claiming a fixed database date", () => {
	expect(performanceClockEvidence("2026-10-29", true)).toEqual({
		applicationDate: "2026-10-04",
		consistent: false,
		databaseDate: "2026-10-29",
	});
});

test("missing, malformed and impossible PostgreSQL dates fail even in diagnostic mode", () => {
	for (const date of ["", "2026-1-04", "2026-02-30", "2026-13-04", "invalid", "2026-10-04T12:00:00Z"])
		expect(() => performanceClockEvidence(date, true)).toThrow("Invalid PostgreSQL business date");
});
