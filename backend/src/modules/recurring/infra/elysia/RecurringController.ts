import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { distributedCache } from "~/shared/infra/cache";
import { strictJsonBody } from "~/shared/infra/elysia/strict-json-body";
import { getCachedRecurrenceHistory } from "../../application/recurrence-history";
import {
	deleteRecurrence,
	getStoredRecurrence,
	listRecurrenceSummaries,
	materializeRecurrence,
	presentRecurrence,
	saveRecurrence,
} from "../../application/recurrences";
import {
	RecurrenceBody,
	RecurrenceHistoryQuery,
	RecurrenceHistoryReturn,
	RecurrenceReturn,
	RecurrenceSuccessReturn,
	RecurrenceSummaryReturn,
	ReplayRecurrenceBody,
	ReplayRecurrenceReturn,
	UpdateRecurrenceBody,
} from "./RecurrenceDTO";

const params = t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) });
export const RecurringController = new Elysia({ prefix: "/recurring" })
	.onTransform(({ request, body }) => {
		const path = new URL(request.url).pathname;
		if (request.method === "POST" && /^\/recurring\/?$/.test(path)) strictJsonBody(body, RecurrenceBody);
		if (request.method === "PATCH" && /^\/recurring\/[^/]+\/?$/.test(path))
			strictJsonBody(body, UpdateRecurrenceBody);
	})
	.get(
		"/",
		async ({ request, query, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"schedules:overview",
				{ isActive: query.isActive, version: 2 },
				() => listRecurrenceSummaries(userId, query.isActive),
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return undefined as never;
			}
			return cached.value;
		},
		{ query: t.Object({ isActive: t.Optional(t.Boolean()) }), response: t.Array(RecurrenceSummaryReturn) },
	)
	.get(
		"/:id",
		async ({ request, params, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"schedules:detail",
				{ id: params.id },
				async () => presentRecurrence(await getStoredRecurrence(userId, params.id)),
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return undefined as never;
			}
			return cached.value;
		},
		{ params, response: RecurrenceReturn },
	)
	.post("/", async ({ request, body }) => saveRecurrence(await requireUserId(request), body), {
		body: RecurrenceBody,
		response: RecurrenceReturn,
	})
	.patch(
		"/:id",
		async ({ request, params, body }) => saveRecurrence(await requireUserId(request), body, params.id),
		{
			body: UpdateRecurrenceBody,
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
			const cached = await getCachedRecurrenceHistory(userId, params.id, query);
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
