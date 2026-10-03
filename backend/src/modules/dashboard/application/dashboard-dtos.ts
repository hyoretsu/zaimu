import { t } from "elysia";

export const PeriodReturn = t.Object({
	accountBalance: t.Number(),
	endDate: t.String(),
	endingBalance: t.Number(),
	expenses: t.Number(),
	fixedIncomeBalance: t.Number(),
	income: t.Number(),
	initialBalance: t.Number(),
	net: t.Number(),
	recurringExpenses: t.Number(),
	recurringIncome: t.Number(),
	savingsBalance: t.Number(),
	startDate: t.String(),
	variableIncomeBalance: t.Number(),
});

export const DashboardComparisonQuery = t.Object({
	endDate: t.Optional(t.String({ format: "date" })),
	periodsAfter: t.Optional(t.Integer({ maximum: 60, minimum: 0 })),
	periodsBefore: t.Optional(t.Integer({ maximum: 60, minimum: 0 })),
	startDate: t.Optional(t.String({ format: "date" })),
});
export type DashboardComparisonQuery = typeof DashboardComparisonQuery.static;
