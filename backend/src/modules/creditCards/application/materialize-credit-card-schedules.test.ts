import { describe, expect, test } from "bun:test";
import { getStatementDates, subscriptionOccurrences } from "./materialize-credit-card-schedules";

describe("credit card schedule dates", () => {
	test("moves purchases after closing day to the next statement", () => {
		const dates = getStatementDates({ dueDay: 10, statementDay: 3 }, new Date(2026, 8, 4, 12));
		expect(dates.statementDate.toISOString().slice(0, 10)).toBe("2026-10-03");
		expect(dates.dueDate.toISOString().slice(0, 10)).toBe("2026-10-10");
	});

	test("moves purchases on closing day to the next statement", () => {
		const dates = getStatementDates({ dueDay: 10, statementDay: 3 }, new Date(2026, 8, 3, 12));
		expect(dates.statementDate.toISOString().slice(0, 10)).toBe("2026-10-03");
		expect(dates.dueDate.toISOString().slice(0, 10)).toBe("2026-10-10");
	});

	test("shows a payment after closing in the next purchase cycle", () => {
		const paymentDate = new Date(2026, 7, 20, 12);
		const dates = getStatementDates({ dueDay: 20, statementDay: 15 }, paymentDate);
		expect(dates.statementDate.toISOString().slice(0, 10)).toBe("2026-09-15");
	});

	test("moves due dates after statement dates when due day is earlier", () => {
		const dates = getStatementDates({ dueDay: 3, statementDay: 25 }, new Date(2026, 8, 20, 12));
		expect(dates.statementDate.toISOString().slice(0, 10)).toBe("2026-09-25");
		expect(dates.dueDate.toISOString().slice(0, 10)).toBe("2026-10-03");
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
