import { describe, expect, test } from "bun:test";
import {
	getRecurrenceDay,
	getRecurrenceScheduleDescription,
	getRecurrenceScheduleSummary,
} from "./recurrence-schedule";

describe("recurrence schedule", () => {
	test("only monthly schedules use an independently configured day", () => {
		for (const frequency of ["DAILY", "WEEKLY", "BIWEEKLY", "YEARLY"] as const) {
			expect(getRecurrenceDay(frequency, "2026-09-18", "5")).toBe(18);
		}
		expect(getRecurrenceDay("MONTHLY", "2026-09-18", "5")).toBe(5);
	});

	test("describes the anchor date instead of showing an unrelated payment day", () => {
		expect(getRecurrenceScheduleDescription("DAILY", "2026-09-18")).toContain("todos os dias");
		expect(getRecurrenceScheduleDescription("WEEKLY", "2026-09-18")).toContain("sexta-feira");
		expect(getRecurrenceScheduleDescription("WEEKLY", "2026-09-18", 1)).toContain("segunda-feira");
		expect(getRecurrenceScheduleDescription("BIWEEKLY", "2026-09-18")).toContain("14 dias");
		expect(getRecurrenceScheduleDescription("YEARLY", "2026-09-18")).toContain("18/09");
		expect(getRecurrenceScheduleSummary("DAILY", "2026-09-18", 18)).toBe("");
		expect(getRecurrenceScheduleSummary("WEEKLY", "2026-09-18", 18)).toBe("sexta-feira");
		expect(getRecurrenceScheduleSummary("WEEKLY", "2026-09-18", 18, 1)).toBe("segunda-feira");
		expect(getRecurrenceScheduleSummary("YEARLY", "2026-09-18", 18)).toBe("18/09");
		expect(getRecurrenceScheduleSummary("MONTHLY", "2026-09-18", 5)).toBe("dia 5");
	});
});
