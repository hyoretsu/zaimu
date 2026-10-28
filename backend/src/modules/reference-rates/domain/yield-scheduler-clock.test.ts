import { describe, expect, test } from "bun:test";
import { format } from "date-fns";
import { completedYieldDate, recentReferenceRateWindow, yieldSchedulerClock } from "./yield-scheduler-clock";

describe("yield scheduler", () => {
	test("uses Recife across UTC midnight and closes yesterday", () => {
		const now = new Date("2026-10-28T01:30:00Z");
		expect(yieldSchedulerClock(now)).toMatchObject({ dateKey: "2026-10-27", hour: 22 });
		expect(completedYieldDate(now)).toBe("2026-10-26");
		expect(completedYieldDate(new Date("2027-01-01T12:00:00Z"))).toBe("2026-12-31");
		expect(completedYieldDate(new Date("2024-03-01T12:00:00Z"))).toBe("2024-02-29");
	});
	test("refresh starts at 6h with thirty completed days", () => {
		expect(recentReferenceRateWindow(new Date("2026-10-28T08:59:59Z"))).toBeNull();
		const window = recentReferenceRateWindow(new Date("2026-10-28T09:00:00Z"))!;
		expect(window.slot).toBe("2026-10-28:6");
		expect(format(window.startDate, "yyyy-MM-dd")).toBe("2026-09-28");
		expect(format(window.endDate, "yyyy-MM-dd")).toBe("2026-10-27");
	});
	test("deduplication slot survives same hour, changes next hour and next day", () => {
		const slot = (value: string) => recentReferenceRateWindow(new Date(value))?.slot;
		expect(slot("2026-10-28T09:00:00Z")).toBe(slot("2026-10-28T09:59:59Z"));
		expect(slot("2026-10-28T09:00:00Z")).not.toBe(slot("2026-10-28T10:00:00Z"));
		expect(slot("2026-10-28T09:00:00Z")).not.toBe(slot("2026-10-29T09:00:00Z"));
	});
});
