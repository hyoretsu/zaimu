import { expect, test } from "bun:test";
import {
	processedRecurrencePeriods,
	type RecurrenceDefinition,
	recurrencePeriodStart,
	validateRecurrenceAssociation,
} from "./recurrence";

const recurrence: RecurrenceDefinition = {
	amount: 10,
	createdAt: "2026-01-01",
	dayOfMonth: 31,
	id: "r",
	interval: 1,
	isActive: true,
	materializedThrough: "2026-01-30",
	movement: "EXPENSE",
	name: "Rent",
	originFinancialAccountId: "a",
	startDate: "2026-01-31",
	unit: "MONTH",
	updatedAt: "2026-01-01",
	userId: "u",
};
const target = {
	id: "existing",
	kind: "TRANSACTION" as const,
	originFinancialAccountId: "a",
	type: "EXPENSE",
};
test("association accepts any day in a scheduled month and keeps primary identity", () => {
	expect(() => validateRecurrenceAssociation(recurrence, target, "2026-02-28")).not.toThrow();
	expect(target.id).toBe("existing");
	expect(() => validateRecurrenceAssociation(recurrence, target, "2026-02-27")).not.toThrow();
	expect(() => validateRecurrenceAssociation(recurrence, target, "2025-12-31")).not.toThrow();
	expect(() => validateRecurrenceAssociation(recurrence, target, "2026-02-30")).toThrow();
});
test("association rejects existing links to other occurrences", () => {
	expect(() =>
		validateRecurrenceAssociation(recurrence, { ...target, recurrenceId: "other" }, "2026-02-28"),
	).toThrow("outra ocorrência");
	expect(() =>
		validateRecurrenceAssociation(
			recurrence,
			{ ...target, recurrenceId: "r", recurrenceOccurrenceDate: "2026-01-31" },
			"2026-02-28",
		),
	).toThrow("outra ocorrência");
});
test("period identities ignore date changes and respect month, year and ISO week boundaries", () => {
	expect(recurrencePeriodStart("MONTH", "2026-02-28")).toBe(recurrencePeriodStart("MONTH", "2026-02-01"));
	expect(recurrencePeriodStart("YEAR", "2026-12-31")).toBe("2026-01-01");
	expect(recurrencePeriodStart("WEEK", "2027-01-03")).toBe("2026-12-28");
	expect(recurrencePeriodStart("WEEK", "2027-01-04")).toBe("2027-01-04");
	expect(recurrencePeriodStart("DAY", "2026-02-28")).toBe("2026-02-28");
	expect(processedRecurrencePeriods(recurrence, new Set(["r:2026-02-28", "other:2026-03-01"]))).toEqual(
		new Set(["2026-02-01"]),
	);
	expect(() =>
		validateRecurrenceAssociation(
			recurrence,
			{ ...target, recurrenceId: "r", recurrenceOccurrenceDate: "2026-02-01" },
			"2026-02-28",
		),
	).not.toThrow();
	expect(() =>
		validateRecurrenceAssociation({ ...recurrence, interval: 2 }, target, "2026-02-01"),
	).not.toThrow();
});
