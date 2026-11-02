import { validateBudgetHierarchy } from "@zaimu/finance/monthly-budget";
import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import { HttpException } from "~/shared/errors";
import {
	db,
	executeStatement,
	numeric,
	queryFirst,
	queryRaw,
	queryRows,
	withRawTransaction,
} from "~/shared/infra/sql";
import type { MonthlyBudgetBody, MonthlyBudgetReturn, SyncMonthlyBudget } from "../infra/MonthlyBudgetsDTO";
import { validateMonthlyBudgetFields } from "./validate-monthly-budget";

type BudgetRow = Omit<MonthlyBudgetReturn, "amount" | "createdAt" | "updatedAt" | "deletedAt"> & {
	amount: number | string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
};
const columns = [
	"id",
	"userId",
	"name",
	"source",
	"categoryId",
	"parentBudgetId",
	"amount",
	"currency",
	"startMonth",
	"endMonth",
	"createdAt",
	"updatedAt",
	"deletedAt",
] as const;
// PostgreSQL advisory locks have no builder equivalent; this is the only raw statement kept for serialization.
const lockUserBudgets = (userId: string) =>
	queryRaw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`monthly-budget:${userId}`]);
const serialize = (row: BudgetRow): MonthlyBudgetReturn => ({
	...row,
	amount: Number(row.amount),
	createdAt: row.createdAt.toISOString(),
	deletedAt: row.deletedAt?.toISOString() ?? null,
	updatedAt: row.updatedAt.toISOString(),
});
export async function listMonthlyBudgets(userId: string, includeDeleted = false) {
	const rows = await queryRows(
		db.sql.public.MonthlyBudget.select(...columns)
			.where((f, fn) =>
				includeDeleted
					? fn.eq(f.userId, userId)
					: fn.and(fn.eq(f.userId, userId), fn.eq(f.deletedAt, null)),
			)
			.orderBy("name", { direction: "asc" })
			.orderBy("id", { direction: "asc" })
			.build(),
	);
	return (rows as unknown as BudgetRow[]).map(serialize);
}
export async function validateMonthlyBudget(body: MonthlyBudgetBody, userId: string, id?: string) {
	validateMonthlyBudgetFields(body);
	await lockUserBudgets(userId);
	if (body.source !== "CUSTOM") {
		const name = body.name.trim();
		const candidates = await queryRows(
			db.sql.public.MonthlyBudget.select("id", "startMonth", "endMonth")
				.where((f, fn) =>
					fn.and(
						fn.eq(f.userId, userId),
						fn.eq(f.deletedAt, null),
						fn.eq(f.source, body.source),
						fn.eq(f.currency, body.currency),
						fn.eq(f.categoryId, body.categoryId ?? null),
						...(id ? [fn.ne(f.id, id)] : []),
						...(["CUSTOM", "RESERVE", "UNCATEGORIZED"].includes(body.source)
							? []
							: [fn.eq(f.name, name)]),
					),
				)
				.build(),
		);
		const newEnd = body.endMonth ?? null;
		const newSingle = newEnd === body.startMonth;
		const overlap = candidates.find(
			row =>
				(row.endMonth !== null && row.endMonth === row.startMonth) === newSingle &&
				row.startMonth <= (newEnd ?? "9999-12") &&
				(row.endMonth ?? "9999-12") >= body.startMonth,
		);
		if (overlap) throw new HttpException("Já existe planejamento desta origem no período", 409);
	}
	try {
		validateBudgetHierarchy(
			await listMonthlyBudgets(userId),
			{
				...body,
				amount: body.amount ?? 0,
				categoryId: body.categoryId ?? null,
				endMonth: body.endMonth ?? null,
			},
			id,
		);
	} catch (error) {
		throw new HttpException(error instanceof Error ? error.message : "Hierarquia inválida", 400);
	}
	await assertSupportedCurrency(body.currency);
	if (body.categoryId) {
		const categoryId = body.categoryId;
		const category = await queryFirst(
			db.sql.public.Category.select("id")
				.where((f, fn) => fn.and(fn.eq(f.id, categoryId), fn.eq(f.userId, userId)))
				.build(),
		);
		if (!category) throw new HttpException("Tag não encontrada", 404);
	}
}
export async function saveMonthlyBudget(userId: string, body: MonthlyBudgetBody, id?: string) {
	return withRawTransaction(() => saveMonthlyBudgetInTransaction(userId, body, id));
}
async function saveMonthlyBudgetInTransaction(userId: string, body: MonthlyBudgetBody, id?: string) {
	await validateMonthlyBudget(body, userId, id);
	const values = {
		amount: numeric<20, 6>(body.amount ?? 0),
		categoryId: body.categoryId ?? null,
		currency: body.currency,
		endMonth: body.endMonth ?? null,
		name: body.name.trim(),
		parentBudgetId: body.parentBudgetId ?? null,
		source: body.source,
		startMonth: body.startMonth,
	};
	let row: unknown;
	if (id) {
		const where = (f: { userId: unknown; id: unknown; deletedAt: unknown }, fn: any) =>
			fn.and(fn.eq(f.userId, userId), fn.eq(f.id, id), fn.eq(f.deletedAt, null));
		const [updated] = await queryRows(
			db.sql.public.MonthlyBudget.update(values)
				.where(where as never)
				.returning("id")
				.build(),
		);
		// The update builder cannot mix plain values with DB-clock expressions, so stamp updatedAt in a second statement.
		if (updated)
			[row] = await queryRows(
				db.sql.public.MonthlyBudget.update((_f, fn) => ({
					updatedAt: fn.raw`clock_timestamp()`.returns("pg/timestamp-date@1"),
				}))
					.where(where as never)
					.returning(...columns)
					.build(),
			);
	} else
		[row] = await queryRows(
			db.sql.public.MonthlyBudget.insert([{ ...values, userId }])
				.returning(...columns)
				.build(),
		);
	if (!row) throw new HttpException("Planejamento não encontrado", 404);
	return serialize(row as unknown as BudgetRow);
}
export async function deleteMonthlyBudget(userId: string, id: string) {
	return withRawTransaction(() => deleteMonthlyBudgetInTransaction(userId, id));
}
async function deleteMonthlyBudgetInTransaction(userId: string, id: string) {
	await lockUserBudgets(userId);
	// Recursive CTEs are unsupported by the builder: walk the hierarchy level by level (descendants are
	// followed through already-deleted nodes, as the original recursion did) under the same advisory lock.
	const root = await queryFirst(
		db.sql.public.MonthlyBudget.select("id")
			.where((f, fn) => fn.and(fn.eq(f.id, id), fn.eq(f.userId, userId), fn.eq(f.deletedAt, null)))
			.build(),
	);
	const ids = new Set<string>(root ? [root.id] : []);
	let frontier = [...ids];
	while (frontier.length) {
		const parents = frontier;
		const children = await queryRows(
			db.sql.public.MonthlyBudget.select("id")
				.where((f, fn) => fn.and(fn.in(f.parentBudgetId, parents), fn.eq(f.userId, userId)))
				.build(),
		);
		frontier = children.map(child => child.id).filter(childId => !ids.has(childId));
		for (const childId of frontier) ids.add(childId);
	}
	const rows = ids.size
		? await queryRows(
				db.sql.public.MonthlyBudget.update((_f, fn) => ({
					deletedAt: fn.raw`clock_timestamp()`.returns("pg/timestamp-date@1"),
					updatedAt: fn.raw`clock_timestamp()`.returns("pg/timestamp-date@1"),
				}))
					.where((f, fn) =>
						fn.and(fn.in(f.id, [...ids]), fn.eq(f.userId, userId), fn.eq(f.deletedAt, null)),
					)
					.returning("id")
					.build(),
			)
		: [];
	if (!rows.length) throw new HttpException("Planejamento não encontrado", 404);
	return { success: true };
}
export async function syncMonthlyBudget(userId: string, entity: typeof SyncMonthlyBudget.static) {
	await lockUserBudgets(userId);
	const existing = await queryFirst(
		db.sql.public.MonthlyBudget.select("userId", "deletedAt", "updatedAt")
			.where((f, fn) => fn.eq(f.id, entity.id))
			.forUpdate()
			.build(),
	);
	if (existing && existing.userId !== userId)
		throw new HttpException("Planejamento pertence a outro usuário", 403);
	if (existing?.deletedAt) return;
	if (existing && (!entity.baseUpdatedAt || existing.updatedAt.toISOString() !== entity.baseUpdatedAt))
		throw new HttpException("Planejamento alterado em outro dispositivo", 409);
	if (entity.deletedAt) {
		if (existing) await deleteMonthlyBudget(userId, entity.id);
		else {
			await executeStatement(
				db.sql.public.MonthlyBudget.insert([
					{
						amount: numeric<20, 6>(entity.amount),
						currency: entity.currency,
						endMonth: entity.endMonth,
						id: entity.id,
						name: entity.name,
						source: entity.source === "TAG" ? "CUSTOM" : entity.source,
						startMonth: entity.startMonth,
						userId,
					},
				]).build(),
			);
			await executeStatement(
				db.sql.public.MonthlyBudget.update((_f, fn) => ({
					deletedAt: fn.raw`clock_timestamp()`.returns("pg/timestamp-date@1"),
				}))
					.where((f, fn) => fn.eq(f.id, entity.id))
					.build(),
			);
		}
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
