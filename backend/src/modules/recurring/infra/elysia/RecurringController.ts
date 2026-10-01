import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
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
		async ({ request, params }) => {
			const userId = await requireUserId(request);
			await getStoredRecurrence(userId, params.id);
			return (
				await queryRaw<{
					id: string;
					recurrenceId: string;
					field: string;
					oldValue: string | null;
					newValue: string | null;
					changedAt: Date;
				}>('SELECT * FROM "RecurrenceHistory" WHERE "recurrenceId"=$1 ORDER BY "changedAt" DESC,"id" DESC', [
					params.id,
				])
			).map(row => ({ ...row, changedAt: (row.changedAt as Date).toISOString() }));
		},
		{ params, response: RecurrenceHistoryReturn },
	)
	.post(
		"/:id/replay",
		async ({ request, params, body }) => ({
			created: await materializeRecurrence(await requireUserId(request), params.id, body.through, body),
		}),
		{ body: ReplayRecurrenceBody, params, response: ReplayRecurrenceReturn },
	);
