import { expect, test } from "bun:test";
import { getRecurrenceScheduleSummary } from "./recurrence-schedule";

test("annual summary uses selected day instead of start day", () => {
	expect(getRecurrenceScheduleSummary("YEAR", "2027-03-01", 30)).toBe("30/03");
	expect(getRecurrenceScheduleSummary("YEAR", "2027-02-01", 31)).toBe("28/02");
	expect(getRecurrenceScheduleSummary("YEAR", "2028-02-01", 31)).toBe("29/02");
	expect(getRecurrenceScheduleSummary("YEAR", "2027-03-01", null)).toBe("01/03");
});
