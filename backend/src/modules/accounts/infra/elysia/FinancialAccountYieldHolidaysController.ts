import Elysia from "elysia";
import { requireUserId } from "~/modules/auth";
import { loadCurrencyHolidayRows } from "~/modules/yield-calendar/catalog";
import { HttpException } from "~/shared/errors";
export const FinancialAccountYieldHolidaysController = new Elysia({
	prefix: "/financial-account-yield-holidays",
})
	.get("/", async ({ request }) => {
		await requireUserId(request);
		return loadCurrencyHolidayRows();
	})
	.post("/", async ({ request }) => {
		await requireUserId(request);
		throw new HttpException("Use o calendário administrativo para gerenciar feriados", 403);
	})
	.delete("/:id", async ({ request }) => {
		await requireUserId(request);
		throw new HttpException("Use o calendário administrativo para gerenciar feriados", 403);
	});
