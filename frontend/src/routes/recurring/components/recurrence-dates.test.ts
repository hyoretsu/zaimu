import { describe, expect, test } from "bun:test";
import { isRecurrenceEnded } from "./recurrence-dates";

describe("recurrence end date", () => {
	test("marks a recurrence as ended only after its end date", () => {
		const today = new Date("2026-08-29T12:00:00");

		expect(isRecurrenceEnded("2026-08-28", today)).toBe(true);
		expect(isRecurrenceEnded("2026-08-29", today)).toBe(false);
		expect(isRecurrenceEnded(undefined, today)).toBe(false);
	});
});
