import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { loadCurrencyHolidayRows } from "~/modules/yield-calendar/catalog";
import { HttpException } from "~/shared/errors";
import { HttpErrorReturn } from "~/shared/infra/elysia/transport-responses";
export const FinancialAccountYieldHolidaysController = new Elysia({
	prefix: "/financial-account-yield-holidays",
})
	.get(
		"/",
		async ({ request }) => {
			await requireUserId(request);
			return loadCurrencyHolidayRows();
		},
		{ detail: { operationId: "getFinancialAccountYieldHolidays" } },
	)
	.post(
		"/",
		async ({ request }) => {
			await requireUserId(request);
			throw new HttpException("Use o calendário administrativo para gerenciar feriados", 403);
		},
		{ detail: { operationId: "postFinancialAccountYieldHolidays" }, response: { 403: HttpErrorReturn } },
	)
	.delete(
		"/:id",
		async ({ request }) => {
			await requireUserId(request);
			throw new HttpException("Use o calendário administrativo para gerenciar feriados", 403);
		},
		{
			detail: { operationId: "deleteFinancialAccountYieldHolidaysById" },
			params: t.Object({ id: t.String() }),
			response: { 403: HttpErrorReturn },
		},
	);
