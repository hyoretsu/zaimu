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

test("registered Amazon closings prevent recreation of empty nominal cycles", () => {
	const card = { createdAt: date("2026-05-01"), dueDay: 25, statementDay: 12 };
	const closings = ["2026-05-25", "2026-06-25", "2026-07-25", "2026-08-12"].map(date);
	expect(missingMonthlyStatements(card, closings, date("2026-08-10"))).toEqual([]);
	expect(closings.map(value => value.toISOString().slice(0, 10))).toEqual([
		"2026-05-25",
		"2026-06-25",
		"2026-07-25",
		"2026-08-12",
	]);
});

test("corrected closing days cover their months while actual monthly gaps still fill", () => {
	const card = { createdAt: date("2025-08-01"), dueDay: 25, statementDay: 19 };
	expect(
		missingMonthlyStatements(card, [date("2025-08-18"), date("2025-10-21")], date("2025-10-15")),
	).toEqual([{ dueDate: "2025-09-25", statementDate: "2025-09-19" }]);
});

test("adjusted leap-month closing and unordered recorded dates never create duplicates", () => {
	const card = { createdAt: date("2024-01-01"), dueDay: 10, statementDay: 31 };
	expect(
		missingMonthlyStatements(
			card,
			[date("2024-03-28"), date("2024-01-30"), date("2024-02-27")],
			date("2024-03-15"),
		),
	).toEqual([]);
});
