import { t } from "elysia";

const Month = t.String({ pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" });
export const MonthlyBudgetBody = t.Object({
	amount: t.Optional(t.Nullable(t.Number({ maximum: 99999999999999, minimum: 0 }))),
	categoryId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
	currency: t.String({ pattern: "^[A-Z]{3}$" }),
	endMonth: t.Optional(t.Nullable(Month)),
	name: t.String({ maxLength: 100 }),
	parentBudgetId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
	source: t.Union([
		t.Literal("TAG"),
		t.Literal("STATEMENTS"),
		t.Literal("CUSTOM"),
		t.Literal("RESERVE"),
		t.Literal("UNCATEGORIZED"),
	]),
	startMonth: Month,
});
export type MonthlyBudgetBody = typeof MonthlyBudgetBody.static;
export const MonthlyBudgetReturn = t.Object({
	...MonthlyBudgetBody.properties,
	amount: t.Number({ maximum: 99999999999999, minimum: 0 }),
	categoryId: t.Nullable(t.String()),
	createdAt: t.String({ format: "date-time" }),
	deletedAt: t.Nullable(t.String({ format: "date-time" })),
	endMonth: t.Nullable(Month),
	id: t.String({ maxLength: 36, minLength: 1 }),
	updatedAt: t.String({ format: "date-time" }),
	userId: t.String(),
});
export type MonthlyBudgetReturn = typeof MonthlyBudgetReturn.static;
export const SyncMonthlyBudget = t.Object({
	...MonthlyBudgetReturn.properties,
	baseUpdatedAt: t.Optional(t.String({ format: "date-time" })),
});

export const MonthlyBudgetSummaryQuery = t.Object({ month: Month });
export const MonthlyBudgetSummaryReturn = t.Object({
	items: t.Array(
		t.Object({
			...MonthlyBudgetBody.properties,
			additionalAmount: t.Number(),
			amount: t.Number({ maximum: 99999999999999, minimum: 0 }),
			categoryId: t.Nullable(t.String()),
			endMonth: t.Nullable(Month),
			id: t.String({ maxLength: 36, minLength: 1 }),
			knownAmount: t.Number(),
			plannedAmount: t.Number(),
			projectedAmount: t.Number(),
		}),
	),
	month: Month,
});
