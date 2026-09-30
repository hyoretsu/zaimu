import { describe, expect, test } from "bun:test";
import { statementCutoffAfter } from "@zaimu/finance/credit-card";
import type { CreditCardStatement } from "./api";
import { ignoredThroughStatement } from "./card-adjustment";

const invoice = (date: string) =>
	({
		dueDate: date,
		statementDate: date,
	}) as CreditCardStatement;

describe("card adjustments", () => {
	test("includes the selected invoice across month and leap-year boundaries", () => {
		const dates = ["2026-08-15", "2026-09-27", "2026-10-05"];
		const cutoff = statementCutoffAfter(dates[1]!);
		expect(cutoff).toBe("2026-09-28");
		expect(dates.filter(date => date < cutoff)).toEqual(dates.slice(0, 2));
		expect(statementCutoffAfter("2024-02-29")).toBe("2024-03-01");
	});

	test("preserves a prior exclusive cutoff and gaps between recorded invoices", () => {
		const invoices = [invoice("2026-07-15"), invoice("2026-09-27")];
		expect(ignoredThroughStatement(invoices, "2026-09-27")?.statementDate).toBe("2026-07-15");
		expect(
			ignoredThroughStatement(
				[invoice("2026-07-15"), { ...invoice("2026-08-15"), isForecast: true }, invoice("2026-09-27")],
				"2026-09-27",
			)?.statementDate,
		).toBe("2026-07-15");
		expect(ignoredThroughStatement(invoices, "2026-07-15")).toBeNull();
		expect(ignoredThroughStatement(invoices, null)).toBeNull();
	});
});
