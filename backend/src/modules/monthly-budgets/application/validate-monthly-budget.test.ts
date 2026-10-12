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
	test("blank name rejected", () => {
		expect(() => validateMonthlyBudgetFields({ ...budget, name: "  " })).toThrow();
	});
	test("end month must not precede start", () => {
		expect(() => validateMonthlyBudgetFields({ ...budget, endMonth: "2026-09" })).toThrow();
	});
	test("single-month plans supported", () => {
		expect(() => validateMonthlyBudgetFields({ ...budget, endMonth: "2026-10" })).not.toThrow();
	});
});
