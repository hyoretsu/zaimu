import { expect, test } from "bun:test";
import { missingMonthlyStatements } from "./credit-card-schedule-periods";

const date = (value: string) => new Date(`${value}T12:00:00Z`);

test("closing-day 1 fills the next cycle once without creating an extra cycle", () => {
	const card = { createdAt: date("2026-09-10"), dueDay: 10, statementDay: 1 };
	expect(missingMonthlyStatements(card, [date("2026-10-01")], date("2026-10-04"))).toEqual([
		{ dueDate: "2026-11-10", statementDate: "2026-11-01" },
	]);
	expect(
		missingMonthlyStatements(card, [date("2026-10-01"), date("2026-11-01")], date("2026-10-04")),
	).toEqual([]);
});

test("leap-year and short-month closings preserve existing periods and due dates", () => {
	const card = { createdAt: date("2024-01-15"), dueDay: 10, statementDay: 31 };
	expect(missingMonthlyStatements(card, [date("2024-01-31")], date("2024-02-15"))).toEqual([
		{ dueDate: "2024-03-10", statementDate: "2024-02-29" },
	]);
});
