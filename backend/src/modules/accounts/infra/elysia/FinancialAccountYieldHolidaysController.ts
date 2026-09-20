import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { enqueueUserYieldRecalculations } from "~/modules/reference-rates/application/reference-rate-jobs";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";

const HolidayDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export const FinancialAccountYieldHolidaysController = new Elysia({
	prefix: "/financial-account-yield-holidays",
})
	.get(
		"/",
		async ({ request }) => {
			const userId = await requireUserId(request);
			return queryRows(
				db.sql.public.FinancialAccountYieldHoliday.select("id", "date")
					.where((fields, functions) => functions.eq(fields.userId, userId))
					.orderBy("date", { direction: "asc" })
					.build(),
			);
		},
		{ detail: { tags: ["Accounts"] } },
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			const date = new Date(`${body.date}T12:00:00`);
			if (Number.isNaN(date.valueOf())) throw new HttpException("Informe um feriado válido", 400);
			const existing = await queryFirst(
				db.sql.public.FinancialAccountYieldHoliday.select("id", "date")
					.where((fields, functions) =>
						functions.and(functions.eq(fields.userId, userId), functions.eq(fields.date, date)),
					)
					.limit(1)
					.build(),
			);
			if (existing) return existing;
			const holiday = await queryFirst(
				db.sql.public.FinancialAccountYieldHoliday.insert([{ date, userId }]).returning("id", "date").build(),
			);
			if (!holiday) throw new HttpException("Feriado não criado", 500);
			await enqueueUserYieldRecalculations(userId, date, `holiday:${holiday.id}`);
			return holiday;
		},
		{ body: t.Object({ date: HolidayDate }), detail: { tags: ["Accounts"] } },
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const existing = await queryFirst(
				db.sql.public.FinancialAccountYieldHoliday.select("id", "date")
					.where((fields, functions) =>
						functions.and(functions.eq(fields.id, params.id), functions.eq(fields.userId, userId)),
					)
					.limit(1)
					.build(),
			);
			if (!existing) throw new HttpException("Feriado não encontrado", 404);
			await executeStatement(
				db.sql.public.FinancialAccountYieldHoliday.delete()
					.where((fields, functions) => functions.eq(fields.id, existing.id))
					.build(),
			);
			await enqueueUserYieldRecalculations(userId, existing.date, `holiday-delete:${existing.id}`);
			return { success: true };
		},
		{ detail: { tags: ["Accounts"] }, params: t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) }) },
	);
