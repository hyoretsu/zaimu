import { describe, expect, test } from "bun:test";
import { getStatementDates, subscriptionOccurrences } from "./materialize-credit-card-schedules";

describe("credit card schedule dates", () => {
	test("moves purchases after closing day to the next statement", () => {
		const dates = getStatementDates({ dueDay: 10, statementDay: 3 }, new Date(2026, 8, 4, 12));
		expect(dates.statementDate).toEqual(new Date(2026, 9, 3));
		expect(dates.dueDate).toEqual(new Date(2026, 9, 10));
	});

	test("moves due dates after statement dates when due day is earlier", () => {
		const dates = getStatementDates({ dueDay: 3, statementDay: 25 }, new Date(2026, 8, 20, 12));
		expect(dates.statementDate).toEqual(new Date(2026, 8, 25));
		expect(dates.dueDate).toEqual(new Date(2026, 9, 3));
	});

	test("clamps monthly occurrences to the last day of short months", () => {
		const occurrences = subscriptionOccurrences(
			{
				billingDay: 31,
				dayOfWeek: null,
				endDate: null,
				frequency: "MONTHLY",
				startDate: new Date(2026, 0, 31, 12),
			},
			new Date(2026, 2, 31, 12),
		);
		expect(occurrences).toEqual([new Date(2026, 0, 31), new Date(2026, 1, 28), new Date(2026, 2, 31)]);
	});
});
