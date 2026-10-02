import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { queryRaw } from "~/shared/infra/sql";
import { registerDebtUpgrade, UpgradeDebtBody, UpgradeDebtResult } from "./debt-upgrade";

const Id = t.String({ maxLength: 36, minLength: 1 });
const Source = t.Union([t.Literal("salary"), t.Literal("subscription"), t.Literal("recurring")]);
const UpgradeRecurrenceQuery = t.Object({
	ids: t.Array(t.Object({ legacyId: Id, source: Source }), { maxItems: 1000 }),
});
const UpgradeRecurrenceResult = t.Array(
	t.Object({
		deleted: t.Boolean(),
		legacyId: Id,
		recurrenceId: Id,
		source: Source,
	}),
);

/** Upgrade-only resolution. No caller can choose another owner's namespace. */
export const UpgradeController = new Elysia({ prefix: "/upgrades" })
	.post(
		"/recurrence-ids",
		async ({ request, body }) => {
			const userId = await requireUserId(request);
			return queryRaw<{
				deleted: boolean;
				legacyId: string;
				recurrenceId: string;
				source: "salary" | "subscription" | "recurring";
			}>(
				`SELECT m."source",m."legacyId",m."recurrenceId",m."deletedAt" IS NOT NULL AS "deleted"
			 FROM "ApplicationUpgradeRecurrence" m
			 JOIN jsonb_to_recordset($2::jsonb) AS ids("source" text,"legacyId" text)
			 ON ids."source"=m."source" AND ids."legacyId"=m."legacyId"
			 WHERE m."userId"=$1`,
				[userId, JSON.stringify(body.ids)],
			);
		},
		{ body: UpgradeRecurrenceQuery, response: UpgradeRecurrenceResult },
	)
	.post(
		"/debt-origins",
		async ({ request, body }) => registerDebtUpgrade(await requireUserId(request), body),
		{ body: UpgradeDebtBody, response: UpgradeDebtResult },
	);
