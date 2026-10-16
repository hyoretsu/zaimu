import { describe, expect, test } from "bun:test";
import type { MonthlyBudgetBody } from "../infra/MonthlyBudgetsDTO";
import { validateMonthlyBudgetFields } from "./validate-monthly-budget";

const budget: MonthlyBudgetBody = {
	amount: 8500,
	currency: "BRL",
	name: "Faturas",
	source: "STATEMENTS",
	startMonth: "2026-10",
};
describe("monthly budget validation", () => {
	test("aggregate statements need no tag", () => {
		expect(() => validateMonthlyBudgetFields(budget)).not.toThrow();
	});
	test("tag plans require a tag", () => {
		expect(() => validateMonthlyBudgetFields({ ...budget, source: "TAG" })).toThrow();
	});
	test("non-tag plans cannot include a tag", () => {
		expect(() => validateMonthlyBudgetFields({ ...budget, categoryId: "tag" })).toThrow();
	});
	test("blank names supported for every planning source", () => {
		for (const name of ["", "  "]) {
			for (const source of ["STATEMENTS", "CUSTOM", "RESERVE", "UNCATEGORIZED", "TAG"] as const)
				expect(() =>
					validateMonthlyBudgetFields({
						...budget,
						categoryId: source === "TAG" ? "tag" : null,
						name,
						source,
					}),
				).not.toThrow();
		}
	});
	test("end month must not precede start", () => {
		expect(() => validateMonthlyBudgetFields({ ...budget, endMonth: "2026-09" })).toThrow();
	});
	test("single-month plans supported", () => {
		expect(() => validateMonthlyBudgetFields({ ...budget, endMonth: "2026-10" })).not.toThrow();
	});
});

test("savings plans need no tag and reject tagged savings", () => {
	expect(() => validateMonthlyBudgetFields({ ...budget, source: "RESERVE" })).not.toThrow();
	expect(() => validateMonthlyBudgetFields({ ...budget, categoryId: "tag", source: "RESERVE" })).toThrow();
});

test("only uncategorized budgets allow no planned amount", () => {
	for (const amount of [undefined, null, 0]) {
		expect(() => validateMonthlyBudgetFields({ ...budget, amount, source: "UNCATEGORIZED" })).not.toThrow();
		expect(() => validateMonthlyBudgetFields({ ...budget, amount, source: "CUSTOM" })).toThrow();
	}
});
