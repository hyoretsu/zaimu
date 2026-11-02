import { toMinorUnits } from "@zaimu/finance/money";
import { format } from "date-fns";
import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { HttpException } from "~/shared/errors";
import { db, numeric, param, queryFirst, queryRaw, queryRows } from "~/shared/infra/sql";
import { balanceBeforeAdjustment } from "../../application/balance-adjustment-reconciliation";

const DateKey = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const AdjustmentBody = t.Object({
	balance: t.Number({ maximum: 9999999999.99, minimum: -9999999999.99 }),
	date: DateKey,
	financialAccountId: t.String({ maxLength: 36, minLength: 1 }),
});

// SQL DATE columns arrive as YYYY-MM-DD; the previous driver returned local-midnight Dates, so keep the calendar day local.
const localDate = (value: Date | string) =>
	typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;

const rowDateKey = (value: Date | string) =>
	typeof value === "string" ? value.slice(0, 10) : format(value, "yyyy-MM-dd");

function parseDate(value: string) {
	const date = new Date(`${value}T12:00:00Z`);
	if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
		throw new HttpException("Informe uma data válida", 400);
	return date;
}

async function assertEligibleAccount(userId: string, accountId: string) {
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select("id", "type", "currency")
			.where((fields, functions) =>
				functions.and(functions.eq(fields.id, accountId), functions.eq(fields.userId, userId)),
			)
			.limit(1)
			.build(),
	);
	const rewards =
		account?.type === "REWARDS"
			? await queryFirst(
					db.sql.public.RewardsAccount.select("kind")
						.where((fields, functions) => functions.eq(fields.financialAccountId, accountId))
						.limit(1)
						.build(),
				)
			: null;
	if (
		!account ||
		account.type === "CREDIT_CARD" ||
		(account.type === "REWARDS" && rewards?.kind !== "CASHBACK")
	)
		throw new HttpException("Selecione uma conta com saldo válido", 400);
	return account;
}

export const BalanceAdjustmentsController = new Elysia({ prefix: "/balance-adjustments" })
	.get(
		"/",
		async ({ request }) => {
			const userId = await requireUserId(request);
			const rows = await queryRows(
				db.sql.public.BalanceAdjustment.innerJoin(db.sql.public.FinancialAccount, (f, fn) =>
					fn.eq(f.BalanceAdjustment.financialAccountId, f.FinancialAccount.id),
				)
					.outerLeftJoin(db.sql.public.FinancialInstitution, (f, fn) =>
						fn.eq(f.FinancialAccount.institutionId, f.FinancialInstitution.id),
					)
					.select(f => ({
						accountName: f.FinancialAccount.name,
						balance: f.BalanceAdjustment.balance,
						createdAt: f.BalanceAdjustment.createdAt,
						currency: f.BalanceAdjustment.currency,
						date: f.BalanceAdjustment.date,
						financialAccountId: f.BalanceAdjustment.financialAccountId,
						id: f.BalanceAdjustment.id,
						institutionName: f.FinancialInstitution.name,
						updatedAt: f.BalanceAdjustment.updatedAt,
						userId: f.BalanceAdjustment.userId,
					}))
					.where((f, fn) => fn.eq(f.BalanceAdjustment.userId, userId))
					.orderBy(f => f.BalanceAdjustment.date, { direction: "desc" })
					.orderBy(f => f.BalanceAdjustment.createdAt, { direction: "desc" })
					.build(),
			);
			const adjustments = rows.map(({ accountName, institutionName, ...row }) => ({
				...row,
				date: localDate(row.date),
				name: accountName ?? institutionName ?? null,
			}));
			return Promise.all(
				adjustments.map(async adjustment => ({
					...adjustment,
					calculatedBalance: await balanceBeforeAdjustment(queryRaw, userId, {
						...adjustment,
						date: rowDateKey(adjustment.date),
					}),
				})),
			);
		},
		{ detail: { operationId: "getBalanceAdjustments", tags: ["Accounts"] } },
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			const account = await assertEligibleAccount(userId, body.financialAccountId);
			toMinorUnits(Math.abs(body.balance), account.currency);
			const date = parseDate(body.date);
			const existing = await queryRows(
				db.sql.public.BalanceAdjustment.select("id")
					.where((f, fn) =>
						fn.and(
							fn.eq(f.userId, userId),
							fn.eq(f.financialAccountId, body.financialAccountId),
							fn.eq(f.date, body.date),
						),
					)
					.build(),
			);
			if (existing.length)
				throw new HttpException("Já existe um ajuste nesta data para esta conta", 409);
			const [adjustment] = await queryRows(
				db.sql.public.BalanceAdjustment.insert([
					{
						balance: numeric<20, 6>(body.balance),
						currency: account.currency,
						date: body.date,
						financialAccountId: body.financialAccountId,
						userId,
					},
				])
					.returning("id", "financialAccountId", "date", "balance", "currency")
					.build(),
			);
			await enqueueAccountYieldRecalculation(
				body.financialAccountId,
				date,
				`balance-adjustment:${adjustment.id}`,
			);
			return { ...adjustment, date: localDate(adjustment.date) };
		},
		{ body: AdjustmentBody, detail: { operationId: "postBalanceAdjustments", tags: ["Accounts"] } },
	)
	.patch(
		"/:id",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const account = await assertEligibleAccount(userId, body.financialAccountId);
			toMinorUnits(Math.abs(body.balance), account.currency);
			const date = parseDate(body.date);
			const [previous] = await queryRows(
				db.sql.public.BalanceAdjustment.select("date", "financialAccountId")
					.where((f, fn) => fn.and(fn.eq(f.id, params.id), fn.eq(f.userId, userId)))
					.build(),
			);
			if (!previous) throw new HttpException("Ajuste não encontrado", 404);
			const conflict = await queryRows(
				db.sql.public.BalanceAdjustment.select("id")
					.where((f, fn) =>
						fn.and(
							fn.eq(f.userId, userId),
							fn.eq(f.financialAccountId, body.financialAccountId),
							fn.eq(f.date, body.date),
							fn.ne(f.id, params.id),
						),
					)
					.build(),
			);
			if (conflict.length)
				throw new HttpException("Já existe um ajuste nesta data para esta conta", 409);
			const [adjustment] = await queryRows(
				db.sql.public.BalanceAdjustment.update((_f, fn) => {
					const varchar = (value: string) =>
						fn.raw`${param(value, { codecId: "sql/varchar@1" })}`.returns("sql/varchar@1");
					return {
						balance: fn.raw`${param(body.balance, { codecId: "pg/numeric@1" })}`.returns(
							"pg/numeric@1",
						),
						currency: varchar(account.currency),
						date: fn.raw`${param(body.date, { codecId: "pg/date-string@1" })}`.returns(
							"pg/date-string@1",
						),
						financialAccountId: varchar(body.financialAccountId),
						updatedAt: fn.raw`now()`.returns("pg/timestamp-date@1"),
					};
				})
					.where((f, fn) => fn.and(fn.eq(f.id, params.id), fn.eq(f.userId, userId)))
					.returning("id")
					.build(),
			);
			if (!adjustment) throw new HttpException("Ajuste não encontrado", 404);
			await enqueueAccountYieldRecalculation(
				previous.financialAccountId,
				localDate(previous.date),
				`balance-adjustment-old:${params.id}:${Date.now()}`,
			);
			await enqueueAccountYieldRecalculation(
				body.financialAccountId,
				date,
				`balance-adjustment-new:${params.id}:${Date.now()}`,
			);
			return adjustment;
		},
		{
			body: AdjustmentBody,
			detail: { operationId: "patchBalanceAdjustmentsById", tags: ["Accounts"] },
			params: t.Object({ id: t.String() }),
		},
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const deleted = await queryRows(
				db.sql.public.BalanceAdjustment.delete()
					.where((f, fn) => fn.and(fn.eq(f.id, params.id), fn.eq(f.userId, userId)))
					.returning("id", "date", "financialAccountId")
					.build(),
			);
			if (!deleted.length) throw new HttpException("Ajuste não encontrado", 404);
			await enqueueAccountYieldRecalculation(
				deleted[0]!.financialAccountId,
				localDate(deleted[0]!.date),
				`balance-adjustment-delete:${params.id}`,
			);
			return { success: true };
		},
		{
			detail: { operationId: "deleteBalanceAdjustmentsById", tags: ["Accounts"] },
			params: t.Object({ id: t.String() }),
		},
	);
