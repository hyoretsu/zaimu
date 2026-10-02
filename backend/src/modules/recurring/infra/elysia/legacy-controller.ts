import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { distributedCache } from "~/shared/infra/cache";
import {
	type LegacyRecurrenceSource,
	listLegacyRecurrences,
	presentLegacyRecurrence,
	resolveLegacyRecurrenceId,
	saveLegacyRecurrence,
} from "../../application/legacy-recurrences";
import { getCachedRecurrenceHistory } from "../../application/recurrence-history";
import { deleteRecurrence, getStoredRecurrence, presentRecurrence } from "../../application/recurrences";
import { RecurrenceHistoryQuery, RecurrenceHistoryReturn } from "./RecurrenceDTO";

const entity = t.Record(t.String(), t.Unknown());
const params = t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) });
export function legacyRecurrenceController(prefix: string, source: LegacyRecurrenceSource) {
	return new Elysia({ prefix })
		.get(
			"/",
			async ({ request, query, set }) => {
				const userId = await requireUserId(request);
				const cached = await distributedCache.remember(
					userId,
					"schedules:overview",
					{ isActive: query.isActive, source, version: 2 },
					() => listLegacyRecurrences(userId, source, query.isActive, true),
				);
				set.headers.etag = cached.etag;
				set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
				const items = cached.value;
				return source === "subscription"
					? {
							subscriptions: items,
							totalMonthlyCost: items
								.filter(item => item.isActive)
								.reduce((sum, item) => sum + item.amount, 0),
						}
					: items;
			},
			{
				query: t.Object({ isActive: t.Optional(t.Boolean()) }),
				response: t.Union([
					t.Array(entity),
					t.Object({ subscriptions: t.Array(entity), totalMonthlyCost: t.Number() }),
				]),
			},
		)
		.get(
			"/:id",
			async ({ request, params }) => {
				const userId = await requireUserId(request);
				return presentLegacyRecurrence(
					await presentRecurrence(
						await getStoredRecurrence(userId, await resolveLegacyRecurrenceId(userId, source, params.id)),
					),
					source,
				);
			},
			{ params, response: entity },
		)
		.post(
			"/",
			async ({ request, body }) => saveLegacyRecurrence(await requireUserId(request), source, body),
			{ body: entity, response: entity },
		)
		.patch(
			"/:id",
			async ({ request, params, body }) =>
				saveLegacyRecurrence(await requireUserId(request), source, body, params.id),
			{ body: entity, params, response: entity },
		)
		.delete(
			"/:id",
			async ({ request, params, query }) => {
				const userId = await requireUserId(request);
				return deleteRecurrence(
					userId,
					await resolveLegacyRecurrenceId(userId, source, params.id),
					query.deleteTransactions,
				);
			},
			{
				params,
				query: t.Object({ deleteTransactions: t.Optional(t.Boolean()) }),
				response: t.Object({ success: t.Literal(true) }),
			},
		)
		.get(
			"/:id/history",
			async ({ request, params, query, set }) => {
				const userId = await requireUserId(request);
				const cached = await getCachedRecurrenceHistory(userId, params.id, query, source, () =>
					resolveLegacyRecurrenceId(userId, source, params.id),
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
		);
}
