import { expect, test } from "bun:test";
import { type MonthlyBudgetInput, validateMonthlyBudget } from "./monthly-budget";

const input: MonthlyBudgetInput = {
	amount: 8500,
	categoryId: null,
	currency: "BRL",
	endMonth: null,
	name: "Faturas",
	source: "STATEMENTS",
	startMonth: "2026-10",
};

test("clearing a name preserves an empty value for every planning source", () => {
	for (const source of ["STATEMENTS", "CUSTOM", "TAG"] as const) {
		for (const name of ["", "   "]) {
			const data = { ...input, categoryId: source === "TAG" ? "tag" : null, name, source };
			expect(validateMonthlyBudget(data)).toEqual({ ...data, name: "" });
		}
	}
});

test("monthly plans require valid positive amounts and calendar months", () => {
	for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
		expect(() => validateMonthlyBudget({ ...input, amount })).toThrow();
	for (const startMonth of ["2026-00", "2026-13", "26-10", "2026-10-01"])
		expect(() => validateMonthlyBudget({ ...input, startMonth })).toThrow();
	expect(() => validateMonthlyBudget({ ...input, endMonth: "2026-09" })).toThrow();
	expect(validateMonthlyBudget({ ...input, endMonth: "2026-10" })).toEqual({ ...input, endMonth: "2026-10" });
});

test("tag-based plans require a tag and non-tag plans remove stale references", () => {
	expect(() => validateMonthlyBudget({ ...input, source: "TAG" })).toThrow();
	expect(validateMonthlyBudget({ ...input, categoryId: "old-tag", name: " Faturas " })).toEqual(input);
});
