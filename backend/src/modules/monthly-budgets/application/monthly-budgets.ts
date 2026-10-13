import { validateBudgetHierarchy } from "@zaimu/finance/monthly-budget";
import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import type { MonthlyBudgetBody, MonthlyBudgetReturn, SyncMonthlyBudget } from "../infra/MonthlyBudgetsDTO";
import { validateMonthlyBudgetFields } from "./validate-monthly-budget";

type BudgetRow = Omit<MonthlyBudgetReturn, "createdAt" | "updatedAt" | "deletedAt"> & {
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
};
const columns = `"id","userId","name","source","categoryId","parentBudgetId","amount","currency","startMonth","endMonth","createdAt","updatedAt","deletedAt"`;
const serialize = (row: BudgetRow): MonthlyBudgetReturn => ({
	...row,
	amount: Number(row.amount),
	createdAt: row.createdAt.toISOString(),
	deletedAt: row.deletedAt?.toISOString() ?? null,
	updatedAt: row.updatedAt.toISOString(),
});
export async function listMonthlyBudgets(userId: string, includeDeleted = false) {
	return (
		await queryRaw<BudgetRow>(
			`SELECT ${columns} FROM "MonthlyBudget" WHERE "userId"=$1 AND ($2 OR "deletedAt" IS NULL) ORDER BY "name","id"`,
			[userId, includeDeleted],
		)
	).map(serialize);
}
export async function validateMonthlyBudget(body: MonthlyBudgetBody, userId: string, id?: string) {
	validateMonthlyBudgetFields(body);
	await queryRaw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`monthly-budget:${userId}`]);
	{
		const [overlap] = await queryRaw<{ id: string }>(
			`SELECT "id" FROM "MonthlyBudget" WHERE "userId"=$1 AND "deletedAt" IS NULL AND "source"=$2 AND "currency"=$3 AND "categoryId" IS NOT DISTINCT FROM $4::varchar AND ($5::varchar IS NULL OR "id"<>$5) AND ($2<>'CUSTOM' OR "name"=$8) AND (COALESCE("endMonth"="startMonth",false) = COALESCE($6=$7,false)) AND ($2<>'CUSTOM' OR "name"=$8) AND (COALESCE("endMonth"="startMonth",false) = COALESCE($6=$7,false)) AND "startMonth"<=COALESCE($6,'9999-12') AND COALESCE("endMonth",'9999-12')>=$7`,
			[
				userId,
				body.source,
				body.currency,
				body.categoryId ?? null,
				id ?? null,
				body.endMonth ?? null,
				body.startMonth,
				body.name.trim(),
			],
		);
		if (overlap) throw new HttpException("Já existe planejamento desta origem no período", 409);
	}
	try {
		validateBudgetHierarchy(
			await listMonthlyBudgets(userId),
			{ ...body, categoryId: body.categoryId ?? null, endMonth: body.endMonth ?? null },
			id,
		);
	} catch (error) {
		throw new HttpException(error instanceof Error ? error.message : "Hierarquia inválida", 400);
	}
	await assertSupportedCurrency(body.currency);
	if (body.categoryId) {
		const [category] = await queryRaw<{ id: string }>(
			'SELECT "id" FROM "Category" WHERE "id"=$1 AND "userId"=$2',
			[body.categoryId, userId],
		);
		if (!category) throw new HttpException("Tag não encontrada", 404);
	}
}
export async function saveMonthlyBudget(userId: string, body: MonthlyBudgetBody, id?: string) {
	return withRawTransaction(() => saveMonthlyBudgetInTransaction(userId, body, id));
}
async function saveMonthlyBudgetInTransaction(userId: string, body: MonthlyBudgetBody, id?: string) {
	await validateMonthlyBudget(body, userId, id);
	const values = [
		userId,
		body.name.trim(),
		body.source,
		body.categoryId ?? null,
		body.amount,
		body.currency,
		body.startMonth,
		body.endMonth ?? null,
		body.parentBudgetId ?? null,
	];
	const [row] = id
		? await queryRaw<BudgetRow>(
				`UPDATE "MonthlyBudget" SET "name"=$2,"source"=$3,"categoryId"=$4,"amount"=$5,"currency"=$6,"startMonth"=$7,"endMonth"=$8,"parentBudgetId"=$9,"updatedAt"=clock_timestamp() WHERE "userId"=$1 AND "id"=$10 AND "deletedAt" IS NULL RETURNING ${columns}`,
				[...values, id],
			)
		: await queryRaw<BudgetRow>(
				`INSERT INTO "MonthlyBudget" ("userId","name","source","categoryId","amount","currency","startMonth","endMonth","parentBudgetId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns}`,
				values,
			);
	if (!row) throw new HttpException("Planejamento não encontrado", 404);
	return serialize(row);
}
export async function deleteMonthlyBudget(userId: string, id: string) {
	return withRawTransaction(() => deleteMonthlyBudgetInTransaction(userId, id));
}
async function deleteMonthlyBudgetInTransaction(userId: string, id: string) {
	await queryRaw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`monthly-budget:${userId}`]);
	const [child] = await queryRaw<{ id: string }>(
		'SELECT "id" FROM "MonthlyBudget" WHERE "userId"=$1 AND "parentBudgetId"=$2 AND "deletedAt" IS NULL LIMIT 1',
		[userId, id],
	);
	if (child)
		throw new HttpException(
			"Remova ou desvincule subcategorias antes de excluir o orçamento principal.",
			409,
		);
	const rows = await queryRaw<{ id: string }>(
		'UPDATE "MonthlyBudget" SET "deletedAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE "id"=$1 AND "userId"=$2 AND "deletedAt" IS NULL RETURNING "id"',
		[id, userId],
	);
	if (!rows.length) throw new HttpException("Planejamento não encontrado", 404);
	return { success: true };
}
export async function syncMonthlyBudget(userId: string, entity: typeof SyncMonthlyBudget.static) {
	await queryRaw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`monthly-budget:${userId}`]);
	const [existing] = await queryRaw<{ userId: string; deletedAt: Date | null; updatedAt: Date }>(
		'SELECT "userId","deletedAt","updatedAt" FROM "MonthlyBudget" WHERE "id"=$1 FOR UPDATE',
		[entity.id],
	);
	if (existing && existing.userId !== userId)
		throw new HttpException("Planejamento pertence a outro usuário", 403);
	if (existing?.deletedAt) return;
	if (existing && (!entity.baseUpdatedAt || existing.updatedAt.toISOString() !== entity.baseUpdatedAt))
		throw new HttpException("Planejamento alterado em outro dispositivo", 409);
	if (entity.deletedAt) {
		if (existing) await deleteMonthlyBudget(userId, entity.id);
		else
			await queryRaw(
				'INSERT INTO "MonthlyBudget" ("id","userId","name","source","categoryId","amount","currency","startMonth","endMonth","deletedAt") VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,clock_timestamp())',
				[
					entity.id,
					userId,
					entity.name,
					entity.source === "TAG" ? "CUSTOM" : entity.source,
					entity.amount,
					entity.currency,
					entity.startMonth,
					entity.endMonth,
				],
			);
		return;
	}
	if (existing) {
		await saveMonthlyBudget(userId, entity, entity.id);
		return;
	}
	await validateMonthlyBudget(entity, userId);
	await queryRaw(
		'INSERT INTO "MonthlyBudget" ("id","userId","name","source","categoryId","amount","currency","startMonth","endMonth","parentBudgetId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT ("id") DO NOTHING',
		[
			entity.id,
			userId,
			entity.name.trim(),
			entity.source,
			entity.categoryId,
			entity.amount,
			entity.currency,
			entity.startMonth,
			entity.endMonth,
			entity.parentBudgetId ?? null,
		],
	);
}
