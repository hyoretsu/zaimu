import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import {
	decodePaginationCursor,
	encodePaginationCursor,
	paginationFilterHash,
} from "~/shared/application/pagination-cursor";
import { distributedCache } from "~/shared/infra/cache";
import { queryRaw } from "~/shared/infra/sql";
import { legacyRecurrenceInput, presentLegacyRecurrence } from "../../application/legacy-recurrences";
import {
	deleteRecurrence,
	getStoredRecurrence,
	listRecurrences,
	materializeRecurrence,
	presentRecurrence,
	saveRecurrence,
} from "../../application/recurrences";
import {
	LegacyRecurringBody,
	RecurrenceBody,
	RecurrenceHistoryQuery,
	RecurrenceHistoryReturn,
	RecurrenceReturn,
	RecurrenceSuccessReturn,
	ReplayRecurrenceBody,
	ReplayRecurrenceReturn,
	UpdateRecurrenceBody,
} from "./RecurrenceDTO";

const params = t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) });
export const RecurringController = new Elysia({ prefix: "/recurring" })
	.get("/", async ({ request, query }) => listRecurrences(await requireUserId(request), query.isActive), {
		query: t.Object({ isActive: t.Optional(t.Boolean()) }),
		response: t.Array(RecurrenceReturn),
	})
	.get(
		"/:id",
		async ({ request, params }) =>
			presentRecurrence(await getStoredRecurrence(await requireUserId(request), params.id)),
		{ params, response: RecurrenceReturn },
	)
	.post(
		"/",
		async ({ request, body }) =>
			saveRecurrence(
				await requireUserId(request),
				"movement" in body ? body : await legacyRecurrenceInput("recurring", body),
				undefined,
				"movement" in body ? undefined : { source: "recurring" },
				!("movement" in body),
			),
		{
			body: t.Union([RecurrenceBody, LegacyRecurringBody]),
			response: RecurrenceReturn,
		},
	)
	.patch(
		"/:id",
		async ({ request, params, body }) => {
			const userId = await requireUserId(request);
			if ("frequency" in body || "financialAccountId" in body || "paymentMethod" in body || "day" in body) {
				const existing = await getStoredRecurrence(userId, params.id);
				const old = await presentLegacyRecurrence(
					existing as typeof existing & Record<string, unknown>,
					"recurring",
				);
				return saveRecurrence(
					userId,
					await legacyRecurrenceInput("recurring", { ...old, ...body }),
					params.id,
					undefined,
					true,
				);
			}
			return saveRecurrence(userId, body, params.id);
		},
		{
			body: t.Union([UpdateRecurrenceBody, t.Partial(LegacyRecurringBody)]),
			params,
			response: RecurrenceReturn,
		},
	)
	.delete(
		"/:id",
		async ({ request, params, query }) =>
			deleteRecurrence(await requireUserId(request), params.id, query.deleteTransactions),
		{
			params,
			query: t.Object({ deleteTransactions: t.Optional(t.Boolean()) }),
			response: RecurrenceSuccessReturn,
		},
	)
	.get(
		"/:id/history",
		async ({ request, params, query, set }) => {
			const userId = await requireUserId(request);
			const limit = query.limit ?? 50;
			const filterHash = paginationFilterHash(userId, { domain: "recurrence-history", id: params.id });
			const cursor = decodePaginationCursor(
				query.cursor,
				filterHash,
				(value): value is { changedAt: string; id: string } => {
					if (!value || typeof value !== "object") return false;
					const item = value as Record<string, unknown>;
					return (
						typeof item.id === "string" &&
						item.id.length > 0 &&
						typeof item.changedAt === "string" &&
						Number.isFinite(Date.parse(item.changedAt))
					);
				},
			);
			const cached = await distributedCache.remember(
				userId,
				"schedules:history",
				{ cursor: query.cursor, id: params.id, limit },
				async () => {
					await getStoredRecurrence(userId, params.id);
					const rows = await queryRaw<{
						id: string;
						recurrenceId: string;
						field: string;
						oldValue: string | null;
						newValue: string | null;
						changedAt: Date;
					}>(
						`SELECT "id", "recurrenceId", "field", "oldValue", "newValue", "changedAt" FROM "RecurrenceHistory"
 WHERE "recurrenceId"=$1 AND ($2::timestamp IS NULL OR ("changedAt", "id") < ($2::timestamp, $3::text))
 ORDER BY "changedAt" DESC,"id" DESC LIMIT $4`,
						[params.id, cursor?.changedAt ?? null, cursor?.id ?? null, limit + 1],
					);
					const hasMore = rows.length > limit;
					const items = rows.slice(0, limit).map(row => ({ ...row, changedAt: row.changedAt.toISOString() }));
					const last = items.at(-1);
					return {
						hasMore,
						items,
						nextCursor:
							hasMore && last
								? encodePaginationCursor({ filterHash, value: { changedAt: last.changedAt, id: last.id } })
								: null,
					};
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return undefined as never;
			}
			return cached.value;
		},
		{ params, query: RecurrenceHistoryQuery, response: RecurrenceHistoryReturn },
	)
	.post(
		"/:id/replay",
		async ({ request, params, body }) => ({
			created: await materializeRecurrence(await requireUserId(request), params.id, body.through, body),
		}),
		{ body: ReplayRecurrenceBody, params, response: ReplayRecurrenceReturn },
	);
