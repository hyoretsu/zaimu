import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { defaultCurrency } from "~/modules/currencies/application/currency-defaults";
import { getMonthlyBudgetSummary } from "../application/monthly-budget-summary";
import { deleteMonthlyBudget, listMonthlyBudgets, saveMonthlyBudget } from "../application/monthly-budgets";
import {
	MonthlyBudgetBody,
	MonthlyBudgetReturn,
	MonthlyBudgetSummaryQuery,
	MonthlyBudgetSummaryReturn,
} from "./MonthlyBudgetsDTO";

const params = t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) });
export const MonthlyBudgetsController = new Elysia({ prefix: "/monthly-budgets" })
	.get("/", async ({ request }) => listMonthlyBudgets(await requireUserId(request)), {
		detail: { operationId: "getMonthlyBudgets", tags: ["MonthlyBudgets"] },
		response: t.Array(MonthlyBudgetReturn),
	})
	.get(
		"/summary",
		async ({ request, query }) => {
			const userId = await requireUserId(request);
			return getMonthlyBudgetSummary(
				userId,
				query.month,
				await defaultCurrency(userId, request.headers.get("X-Currency")),
			);
		},
		{
			detail: { operationId: "getMonthlyBudgetsSummary", tags: ["MonthlyBudgets"] },
			query: MonthlyBudgetSummaryQuery,
			response: MonthlyBudgetSummaryReturn,
		},
	)
	.post("/", async ({ request, body }) => saveMonthlyBudget(await requireUserId(request), body), {
		body: MonthlyBudgetBody,
		detail: { operationId: "postMonthlyBudgets", tags: ["MonthlyBudgets"] },
		response: MonthlyBudgetReturn,
	})
	.put(
		"/:id",
		async ({ request, body, params }) => saveMonthlyBudget(await requireUserId(request), body, params.id),
		{
			body: MonthlyBudgetBody,
			detail: { operationId: "putMonthlyBudgetsById", tags: ["MonthlyBudgets"] },
			params,
			response: MonthlyBudgetReturn,
		},
	)
	.delete(
		"/:id",
		async ({ request, params }) => deleteMonthlyBudget(await requireUserId(request), params.id),
		{
			detail: { operationId: "deleteMonthlyBudgetsById", tags: ["MonthlyBudgets"] },
			params,
			response: t.Object({ success: t.Boolean() }),
		},
	);
