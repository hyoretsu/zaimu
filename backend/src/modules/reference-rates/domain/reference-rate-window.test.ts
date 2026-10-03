import { expect, test } from "bun:test";
import { format } from "date-fns";
import { referenceRateBootstrapIntervals, referenceRateWindow } from "./reference-rate-window";

const key = (date: Date) => format(date, "yyyy-MM-dd");
test("window excludes today and includes exactly ten calendar years", () => {
	const window = referenceRateWindow(new Date("2026-10-03T12:00:00"));
	expect(key(window.startDate)).toBe("2016-10-03");
	expect(key(window.endDate)).toBe("2026-10-02");
});
test("bootstrap has contiguous annual chunks and a bounded current-year tail", () => {
	const intervals = referenceRateBootstrapIntervals(new Date("2026-10-03T12:00:00"));
	expect(intervals).toHaveLength(11);
	expect(key(intervals[0]!.startDate)).toBe("2016-01-01");
	expect(key(intervals[0]!.endDate)).toBe("2016-12-31");
	expect(key(intervals.at(-1)!.endDate)).toBe("2026-10-02");
});
test("leap-day windows clamp to valid calendar dates", () => {
	expect(key(referenceRateWindow(new Date("2024-02-29T12:00:00")).startDate)).toBe("2014-02-28");
});
