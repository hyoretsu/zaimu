import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { HttpException } from "~/shared/errors";
import { db, queryFirst, queryRaw } from "~/shared/infra/sql";

const DateKey = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const AdjustmentBody = t.Object({
	balance: t.Number({ maximum: 9999999999.99, minimum: -9999999999.99 }),
	date: DateKey,
	financialAccountId: t.String({ maxLength: 36, minLength: 1 }),
});

function parseDate(value: string) {
	const date = new Date(`${value}T12:00:00Z`);
	if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
		throw new HttpException("Informe uma data válida", 400);
	return date;
}

async function assertEligibleAccount(userId: string, accountId: string) {
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select("id", "type")
			.where((fields, functions) =>
				functions.and(functions.eq(fields.id, accountId), functions.eq(fields.userId, userId)),
			)
			.limit(1)
			.build(),
	);
	if (!account || account.type === "CREDIT_CARD" || account.type === "REWARDS")
		throw new HttpException("Selecione uma conta com saldo válido", 400);
}

export const BalanceAdjustmentsController = new Elysia({ prefix: "/balance-adjustments" })
	.get(
		"/",
		async ({ request }) => {
			const userId = await requireUserId(request);
			return queryRaw<{
				balance: number;
				calculatedBalance: number;
				createdAt: Date;
				date: Date;
				financialAccountId: string;
				id: string;
				name: null | string;
			}>(
				`SELECT adjustment."id", adjustment."date", adjustment."balance", adjustment."financialAccountId",
				        adjustment."createdAt", COALESCE(account."name", institution."name") AS "name",
				        (COALESCE(previous."balance", 0) + COALESCE(movements.amount, 0)
				          + COALESCE(yields.amount, 0))::numeric AS "calculatedBalance"
				 FROM "BalanceAdjustment" adjustment
				 JOIN "FinancialAccount" account ON account."id" = adjustment."financialAccountId"
				 LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
				 LEFT JOIN LATERAL (
				   SELECT checkpoint."date", checkpoint."balance"
				   FROM "BalanceAdjustment" checkpoint
				   WHERE checkpoint."userId" = $1 AND checkpoint."financialAccountId" = adjustment."financialAccountId"
				     AND checkpoint."date" < adjustment."date"
				   ORDER BY checkpoint."date" DESC LIMIT 1
				 ) previous ON true
				 LEFT JOIN LATERAL (
				   SELECT sum(CASE WHEN transaction."destinationFinancialAccountId" = adjustment."financialAccountId"
				                     THEN COALESCE(transaction."destinationAmount",transaction."amount") ELSE 0 END
				              - CASE WHEN transaction."originFinancialAccountId" = adjustment."financialAccountId"
				                     THEN transaction."amount" ELSE 0 END) AS amount
				   FROM "Transaction" transaction
				   WHERE transaction."userId" = $1 AND transaction."date" <= adjustment."date"
				     AND (previous."date" IS NULL OR transaction."date" > previous."date")
				     AND (transaction."originFinancialAccountId" = adjustment."financialAccountId"
				       OR transaction."destinationFinancialAccountId" = adjustment."financialAccountId")
				 ) movements ON true
				 LEFT JOIN LATERAL (
				   SELECT sum(entry."amount") AS amount
				   FROM "FinancialAccountYield" entry
				   WHERE entry."financialAccountId" = adjustment."financialAccountId"
				     AND entry."date" <= adjustment."date"
				     AND (previous."date" IS NULL OR entry."date" > previous."date")
				     AND NOT entry."isExcluded" AND entry."amount" IS NOT NULL
				 ) yields ON true
				 WHERE adjustment."userId" = $1
				 ORDER BY adjustment."date" DESC, adjustment."createdAt" DESC`,
				[userId],
			);
		},
		{ detail: { tags: ["Accounts"] } },
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			await assertEligibleAccount(userId, body.financialAccountId);
			const date = parseDate(body.date);
			const existing = await queryRaw<{ id: string }>(
				`SELECT "id" FROM "BalanceAdjustment" WHERE "userId" = $1 AND "financialAccountId" = $2 AND "date" = $3`,
				[userId, body.financialAccountId, date],
			);
			if (existing.length) throw new HttpException("Já existe um ajuste nesta data para esta conta", 409);
			const [adjustment] = await queryRaw<{
				balance: number;
				date: Date;
				financialAccountId: string;
				id: string;
			}>(
				`INSERT INTO "BalanceAdjustment" ("userId", "financialAccountId", "date", "balance")
				 VALUES ($1, $2, $3, $4) RETURNING "id", "financialAccountId", "date", "balance"`,
				[userId, body.financialAccountId, date, body.balance],
			);
			await enqueueAccountYieldRecalculation(
				body.financialAccountId,
				new Date(date.valueOf() + 86400000),
				`balance-adjustment:${adjustment.id}`,
			);
			return adjustment;
		},
		{ body: AdjustmentBody, detail: { tags: ["Accounts"] } },
	)
	.patch(
		"/:id",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			await assertEligibleAccount(userId, body.financialAccountId);
			const date = parseDate(body.date);
			const [previous] = await queryRaw<{ date: Date; financialAccountId: string }>(
				`SELECT "date", "financialAccountId" FROM "BalanceAdjustment" WHERE "id" = $1 AND "userId" = $2`,
				[params.id, userId],
			);
			if (!previous) throw new HttpException("Ajuste não encontrado", 404);
			const conflict = await queryRaw<{ id: string }>(
				`SELECT "id" FROM "BalanceAdjustment" WHERE "userId" = $1 AND "financialAccountId" = $2 AND "date" = $3 AND "id" <> $4`,
				[userId, body.financialAccountId, date, params.id],
			);
			if (conflict.length) throw new HttpException("Já existe um ajuste nesta data para esta conta", 409);
			const [adjustment] = await queryRaw<{ id: string }>(
				`UPDATE "BalanceAdjustment" SET "financialAccountId" = $3, "date" = $4,
				 "balance" = $5, "updatedAt" = now()
				 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"`,
				[params.id, userId, body.financialAccountId, date, body.balance],
			);
			if (!adjustment) throw new HttpException("Ajuste não encontrado", 404);
			await enqueueAccountYieldRecalculation(
				previous.financialAccountId,
				new Date(previous.date.valueOf() + 86400000),
				`balance-adjustment-old:${params.id}:${Date.now()}`,
			);
			await enqueueAccountYieldRecalculation(
				body.financialAccountId,
				new Date(date.valueOf() + 86400000),
				`balance-adjustment-new:${params.id}:${Date.now()}`,
			);
			return adjustment;
		},
		{ body: AdjustmentBody, detail: { tags: ["Accounts"] }, params: t.Object({ id: t.String() }) },
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const deleted = await queryRaw<{ date: Date; financialAccountId: string; id: string }>(
				`DELETE FROM "BalanceAdjustment" WHERE "id" = $1 AND "userId" = $2 RETURNING "id", "date", "financialAccountId"`,
				[params.id, userId],
			);
			if (!deleted.length) throw new HttpException("Ajuste não encontrado", 404);
			await enqueueAccountYieldRecalculation(
				deleted[0]!.financialAccountId,
				new Date(deleted[0]!.date.valueOf() + 86400000),
				`balance-adjustment-delete:${params.id}`,
			);
			return { success: true };
		},
		{ detail: { tags: ["Accounts"] }, params: t.Object({ id: t.String() }) },
	);
