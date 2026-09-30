import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import {
	decodePaginationCursor,
	encodePaginationCursor,
	paginationFilterHash,
} from "~/shared/application/pagination-cursor";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { db, executeStatement, nullableNumeric, queryFirst, queryRaw } from "~/shared/infra/sql";

const Id = t.String({ maxLength: 36, minLength: 1 });
const DateKey = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const YieldKind = t.Union([t.Literal("AUTOMATIC"), t.Literal("MANUAL")]);
const YieldTime = t.Union([t.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }), t.Null()]);
const YieldCursorValue = t.Object({ date: t.String(), id: Id, kind: YieldKind });
type YieldCursorValue = typeof YieldCursorValue.static;
export const YieldReturn = t.Object({
	amount: t.Nullable(t.Number()),
	date: t.String({ format: "date-time" }),
	financialAccountId: Id,
	id: Id,
	isExcluded: t.Boolean(),
	isHidden: t.Boolean(),
	kind: YieldKind,
	origin: t.String(),
	time: YieldTime,
});
const YieldPageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(YieldReturn),
	nextCursor: t.Nullable(t.String()),
});

const isYieldCursorValue = (value: unknown): value is YieldCursorValue => {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.date === "string" &&
		typeof candidate.id === "string" &&
		(candidate.kind === "AUTOMATIC" || candidate.kind === "MANUAL")
	);
};

function parseDate(date: string) {
	const value = new Date(`${date}T12:00:00`);
	if (Number.isNaN(value.valueOf())) throw new HttpException("Informe uma data válida", 400);
	return value;
}

async function assertYieldAccount(accountId: string, userId: string) {
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select("id", "type")
			.where((fields, functions) =>
				functions.and(functions.eq(fields.id, accountId), functions.eq(fields.userId, userId)),
			)
			.limit(1)
			.build(),
	);
	if (!account) throw new HttpException("Conta não encontrada", 404);
	if (account.type === "CREDIT_CARD") throw new HttpException("Cartão de crédito não possui rendimento", 400);
}

export function serializeYield(yieldEntry: {
	amount: null | number | string;
	date: Date;
	financialAccountId: string;
	id: string;
	isExcluded: boolean;
	isHidden: boolean;
	kind: string;
	origin: string;
	time: null | string;
}) {
	return {
		...yieldEntry,
		amount: yieldEntry.amount === null ? null : Number(yieldEntry.amount),
		date: yieldEntry.date.toISOString(),
		kind: yieldEntry.kind as "AUTOMATIC" | "MANUAL",
		time: yieldEntry.time?.slice(0, 5) ?? null,
	};
}

export const FinancialAccountYieldsController = new Elysia({ prefix: "/financial-account-yields" })
	.get(
		"/",
		async ({ query, request, set, status }) => {
			const userId = await requireUserId(request);
			await assertYieldAccount(query.financialAccountId, userId);
			const limit = Math.min(query.limit ?? 100, 100);
			const filterHash = paginationFilterHash(userId, { financialAccountId: query.financialAccountId });
			const cursor = decodePaginationCursor(query.cursor, filterHash, isYieldCursorValue);
			const cached = await distributedCache.remember(
				userId,
				"accounts:yields",
				{ cursor: query.cursor, financialAccountId: query.financialAccountId, limit },
				async () => {
					const yields = await queryRaw<{
						amount: null | string;
						date: Date;
						financialAccountId: string;
						id: string;
						isExcluded: boolean;
						isHidden: boolean;
						kind: "AUTOMATIC" | "MANUAL";
						origin: string;
						time: null | string;
					}>(
						`SELECT "id", "financialAccountId", "date", "amount", "kind", "isExcluded", "isHidden", "origin", "time"
						 FROM "public"."FinancialAccountYield"
						 WHERE "financialAccountId" = $1
						 ${cursor ? 'AND ("date", "kind"::text, "id") < ($2::date, $3::text, $4)' : ""}
						 ORDER BY "date" DESC, "kind"::text DESC, "id" DESC
						 LIMIT $${cursor ? 5 : 2}`,
						cursor
							? [query.financialAccountId, cursor.date, cursor.kind, cursor.id, limit + 1]
							: [query.financialAccountId, limit + 1],
					);

					const hasMore = yields.length > limit;
					const items = yields.slice(0, limit).map(serializeYield);
					const last = items.at(-1);
					return {
						hasMore,
						items,
						nextCursor:
							hasMore && last
								? encodePaginationCursor({
										filterHash,
										value: { date: last.date, id: last.id, kind: last.kind },
									})
								: null,
					};
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				return status(304, null);
			}
			return cached.value;
		},
		{
			detail: { tags: ["Accounts"] },
			query: t.Object({
				cursor: t.Optional(t.String()),
				financialAccountId: Id,
				limit: t.Optional(t.Integer({ maximum: 100, minimum: 1 })),
			}),
			response: { 200: YieldPageReturn, 304: t.Null() },
		},
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			await assertYieldAccount(body.financialAccountId, userId);
			const date = parseDate(body.date);
			if (body.kind === "MANUAL" && body.amount === undefined)
				throw new HttpException("Informe o valor do rendimento manual", 400);
			if (body.kind === "AUTOMATIC" && !body.isExcluded && body.amount === undefined)
				throw new HttpException("Informe o valor do rendimento", 400);
			if (body.kind === "MANUAL" && body.isExcluded)
				throw new HttpException("Rendimento manual não pode ser excluído na criação", 400);
			const existing = await queryFirst(
				db.sql.public.FinancialAccountYield.select("id")
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.financialAccountId, body.financialAccountId),
							functions.eq(fields.date, date),
							functions.eq(fields.kind, body.kind),
						),
					)
					.limit(1)
					.build(),
			);
			const values = {
				amount: body.isExcluded ? null : nullableNumeric<12, 4>(body.amount ?? null),
				date,
				isExcluded: body.isExcluded ?? false,
				isHidden: body.kind === "MANUAL" ? (body.isHidden ?? false) : false,
				kind: body.kind,
				origin: "USER" as const,
				time: body.kind === "MANUAL" ? (body.time ?? null) : null,
				updatedAt: new Date(),
			};
			if (existing)
				await executeStatement(
					db.sql.public.FinancialAccountYield.update(values)
						.where((fields, functions) => functions.eq(fields.id, existing.id))
						.build(),
				);
			else
				await executeStatement(
					db.sql.public.FinancialAccountYield.insert([
						{ ...values, financialAccountId: body.financialAccountId },
					]).build(),
				);
			const saved = await queryFirst(
				db.sql.public.FinancialAccountYield.select(
					"id",
					"financialAccountId",
					"date",
					"amount",
					"kind",
					"isExcluded",
					"isHidden",
					"origin",
					"time",
				)
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.financialAccountId, body.financialAccountId),
							functions.eq(fields.date, date),
							functions.eq(fields.kind, body.kind),
						),
					)
					.limit(1)
					.build(),
			);
			if (!saved) throw new HttpException("Rendimento não criado", 500);
			await enqueueAccountYieldRecalculation(
				body.financialAccountId,
				date,
				`yield:${saved.id}:${Date.now()}`,
			);
			return serializeYield(saved);
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				date: DateKey,
				financialAccountId: Id,
				isExcluded: t.Optional(t.Boolean()),
				isHidden: t.Optional(t.Boolean()),
				kind: YieldKind,
				time: t.Optional(YieldTime),
			}),
			detail: { tags: ["Accounts"] },
		},
	)
	.patch(
		"/:id",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const existing = await queryFirst(
				db.sql.public.FinancialAccountYield.select("id", "financialAccountId", "kind", "date")
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);
			if (!existing) throw new HttpException("Rendimento não encontrado", 404);
			await assertYieldAccount(existing.financialAccountId, userId);
			if (existing.kind !== "MANUAL")
				throw new HttpException("Use o ajuste automático para este rendimento", 400);
			await executeStatement(
				db.sql.public.FinancialAccountYield.update({
					amount: nullableNumeric<12, 4>(body.amount),
					...(body.date !== undefined && { date: parseDate(body.date) }),
					...(body.isHidden !== undefined && { isHidden: body.isHidden }),
					...(body.time !== undefined && { time: body.time }),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, existing.id))
					.build(),
			);
			const changed = await queryFirst(
				db.sql.public.FinancialAccountYield.select("date")
					.where((fields, functions) => functions.eq(fields.id, existing.id))
					.limit(1)
					.build(),
			);
			if (changed)
				await enqueueAccountYieldRecalculation(
					existing.financialAccountId,
					new Date(Math.min(existing.date.getTime(), changed.date.getTime())),
					`yield:${existing.id}:${Date.now()}`,
				);
			return { success: true };
		},
		{
			body: t.Object({
				amount: t.Number({ exclusiveMinimum: 0 }),
				date: t.Optional(DateKey),
				isHidden: t.Optional(t.Boolean()),
				time: t.Optional(YieldTime),
			}),
			detail: { tags: ["Accounts"] },
			params: t.Object({ id: Id }),
		},
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const existing = await queryFirst(
				db.sql.public.FinancialAccountYield.select("id", "financialAccountId", "date")
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);
			if (!existing) throw new HttpException("Rendimento não encontrado", 404);
			await assertYieldAccount(existing.financialAccountId, userId);
			await executeStatement(
				db.sql.public.FinancialAccountYield.delete()
					.where((fields, functions) => functions.eq(fields.id, existing.id))
					.build(),
			);
			await enqueueAccountYieldRecalculation(
				existing.financialAccountId,
				existing.date,
				`yield-delete:${existing.id}`,
			);
			return { success: true };
		},
		{ detail: { tags: ["Accounts"] }, params: t.Object({ id: Id }) },
	);
