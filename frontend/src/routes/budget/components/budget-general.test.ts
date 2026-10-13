import { expect, test } from "bun:test";
import type { RecurrenceDefinition } from "@zaimu/finance/recurrence";
import { generalBudgetAvailability } from "./budget-general";

test("general plan uses active recurring income and ignores monthly adjustments", async () => {
	const salary: RecurrenceDefinition = {
		amount: 5100,
		createdAt: "",
		currency: "BRL",
		destinationFinancialAccountId: "account",
		id: "salary",
		interval: 1,
		isActive: true,
		materializedThrough: "2026-10-01",
		movement: "INCOME",
		name: "Salário",
		startDate: "2026-01-01",
		unit: "MONTH",
		updatedAt: "",
		userId: "user",
	};
	const result = await generalBudgetAvailability({
		budgets: [
			{
				amount: 1000,
				categoryId: null,
				currency: "BRL",
				endMonth: null,
				id: "plan",
				name: "Reserva",
				source: "CUSTOM",
				startMonth: "2026-01",
			},
			{
				amount: 500,
				categoryId: null,
				currency: "BRL",
				endMonth: "2026-10",
				id: "extra",
				name: "Extra",
				source: "CUSTOM",
				startMonth: "2026-10",
			},
		],
		currency: "BRL",
		rate: async () => {
			throw new Error("Unexpected conversion");
		},
		recurrences: [
			salary,
			{ ...salary, id: "paused", isActive: false },
			{ ...salary, id: "future", startDate: "2027-01-01" },
		],
		today: "2026-10-13",
	});
	expect(result).toEqual({ expenses: 1000, income: 5100, net: 4100 });
});

test("general plan includes child amounts only through the parent envelope", async () => {
	const base = {
		categoryId: null,
		currency: "BRL",
		endMonth: null,
		name: "Faturas",
		source: "STATEMENTS" as const,
		startMonth: "2026-01",
	};
	const result = await generalBudgetAvailability({
		budgets: [
			{ ...base, amount: 3000, id: "parent" },
			{ ...base, amount: 500, id: "child", name: "Mercado", parentBudgetId: "parent", source: "CUSTOM" },
		],
		currency: "BRL",
		rate: async () => 1,
		recurrences: [],
		today: "2026-10-13",
	});
	expect(result.expenses).toBe(3000);
});
