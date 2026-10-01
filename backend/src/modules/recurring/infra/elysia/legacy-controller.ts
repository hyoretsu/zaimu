import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { queryRaw } from "~/shared/infra/sql";
import {
	type LegacyRecurrenceSource,
	listLegacyRecurrences,
	presentLegacyRecurrence,
	resolveLegacyRecurrenceId,
	saveLegacyRecurrence,
} from "../../application/legacy-recurrences";
import { deleteRecurrence, getStoredRecurrence, presentRecurrence } from "../../application/recurrences";

const entity = t.Record(t.String(), t.Unknown());
const params = t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) });
export function legacyRecurrenceController(prefix: string, source: LegacyRecurrenceSource) {
	return new Elysia({ prefix })
		.get(
			"/",
			async ({ request, query }) => {
				const items = await listLegacyRecurrences(await requireUserId(request), source, query.isActive);
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
			async ({ request, params }) => {
				const userId = await requireUserId(request);
				return queryRaw(
					'SELECT * FROM "RecurrenceHistory" WHERE "recurrenceId"=$1 ORDER BY "changedAt" DESC',
					[await resolveLegacyRecurrenceId(userId, source, params.id)],
				);
			},
			{ params, response: t.Array(entity) },
		);
}
