import Elysia, { t } from "elysia";
import { configureInstitutionCountries } from "~/modules/accounts/application/configure-institution-countries";
import {
	consolidateLegacyInstitution,
	listInstitutionCatalog,
} from "~/modules/accounts/application/consolidate-legacy-institution";
import {
	proposeInstitution,
	reviewInstitutionProposal,
	visibleInstitution,
} from "~/modules/accounts/application/universal-institutions";
import { requireUserId } from "~/modules/auth";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { requireAdmin } from "~/modules/taxes/admin-access";
import { createEventEnvelope } from "~/shared/application/events";
import { HttpException } from "~/shared/errors";
import { FinancialInstitutionYieldPolicyReturn } from "~/shared/infra/elysia/transport-contracts";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { configureInstitutionCardRules } from "../../application/institution-card-rules";
import { InstitutionCardRulesDTO } from "../dto/institution-card-rules";
import { InstitutionCatalogResult } from "../dto/institution-catalog";
import { InstitutionCountriesBody } from "../dto/institution-countries";
import { InstitutionNameBody } from "../dto/institution-name";

const Id = t.String({ maxLength: 36, minLength: 1 });
const DateDTO = t.String({ format: "date" });
const InstitutionBody = t.Object({
	creditInstallmentRemainderOnFirst: t.Optional(t.Boolean()),
	creditStatementClosingInclusive: t.Optional(t.Boolean()),
	currency: t.Optional(t.String({ maxLength: 3, minLength: 3 })),
	effectiveDate: t.Optional(DateDTO),
	name: t.Optional(t.String({ maxLength: 100, minLength: 1 })),
	operatingCountryCodes: t.Optional(t.Array(t.String({ maxLength: 2, minLength: 2 }))),
});

const MutationReturn = t.Object({ id: t.String(), institutionId: t.String(), status: t.String() });
const InstitutionReturn = InstitutionCatalogResult;

const ProposalReturn = t.Object(
	{
		authorId: t.String(),
		baseVersion: t.Nullable(t.Number()),
		createdAt: t.Union([t.Date(), t.String()]),
		effectiveDate: t.Nullable(t.Union([t.Date(), t.String()])),
		id: t.String(),
		institutionId: t.Nullable(t.String()),
		kind: t.String(),
		payload: t.Object({
			...InstitutionBody.properties,
			...t.Partial(FinancialInstitutionYieldPolicyReturn).properties,
			profileId: t.Optional(Id),
			targetId: t.Optional(Id),
		}),
		reason: t.Nullable(t.String()),
		status: t.String(),
	},
	{ additionalProperties: true },
);
const ProfileReturn = t.Object(
	{
		creditCardRules: t.Nullable(InstitutionCardRulesDTO),
		id: t.String(),
		institutionId: t.String(),
		isDefault: t.Boolean(),
		name: t.String(),
	},
	{ additionalProperties: true },
);
const ChangeReturn = t.Object(
	{
		effectiveDate: t.Union([t.Date(), t.String()]),
		id: t.String(),
		linkId: t.String(),
		name: t.Optional(t.String()),
		profileId: t.String(),
	},
	{ additionalProperties: true },
);
const NotificationReturn = t.Object(
	{
		createdAt: t.Union([t.Date(), t.String()]),
		id: t.String(),
		payload: t.Object({
			institutionId: t.Optional(t.Nullable(t.String())),
			proposalId: t.String(),
			reason: t.Optional(t.Nullable(t.String())),
			status: t.Optional(t.String()),
			targetId: t.Optional(t.Nullable(t.String())),
		}),
		readAt: t.Nullable(t.Union([t.Date(), t.String()])),
		type: t.String(),
	},
	{ additionalProperties: true },
);

export const InstitutionsController = new Elysia({ prefix: "/financial-institutions" })
	.get("/catalog", () => listInstitutionCatalog(""), { response: t.Array(InstitutionReturn) })
	.get("/", async ({ request }) => listInstitutionCatalog(await requireUserId(request)), {
		detail: { operationId: "getFinancialInstitutions", tags: ["Institutions"] },
		response: t.Array(InstitutionReturn),
	})
	.get(
		"/review/catalog",
		async ({ request }) => listInstitutionCatalog(await requireAdmin(request), true),
		{
			detail: { operationId: "getFinancialInstitutionsReviewCatalog" },
			response: t.Array(InstitutionReturn),
		},
	)
	.patch(
		"/review/catalog/:id",
		async ({ request, params, body }) => {
			await requireAdmin(request);
			return configureInstitutionCountries(
				params.id,
				body.accountCurrenciesByCountry,
				body.creditStatementClosingInclusive,
				body.name,
			);
		},
		{
			body: InstitutionCountriesBody,
			detail: { operationId: "patchFinancialInstitutionsReviewCatalogById" },
			params: t.Object({ id: Id }),
			response: InstitutionReturn,
		},
	)
	.patch(
		"/review/catalog/:id/card-rules",
		async ({ request, params, body }) => {
			await requireAdmin(request);
			return configureInstitutionCardRules(params.id, body.rules, body.profileId);
		},
		{
			body: t.Object({ profileId: t.Optional(Id), rules: t.Nullable(InstitutionCardRulesDTO) }),
			detail: { operationId: "patchFinancialInstitutionsReviewCatalogByIdCardRules" },
			params: t.Object({ id: Id }),
			response: t.Object({ id: t.String() }),
		},
	)

	.post(
		"/review/legacy/:id",
		async ({ request, params, body }) =>
			consolidateLegacyInstitution(await requireAdmin(request), params.id, body.targetId),
		{
			body: t.Object({ targetId: t.Optional(Id) }),
			detail: { operationId: "postFinancialInstitutionsReviewLegacyById" },
			params: t.Object({ id: Id }),
			response: t.Object({ accounts: t.Integer(), institutionId: t.String(), sourceId: t.String() }),
		},
	)

	.post(
		"/",
		async ({ body, request }) =>
			proposeInstitution(
				await requireUserId(request),
				null,
				"NEW_INSTITUTION",
				body,
				body.effectiveDate,
			),
		{
			body: InstitutionBody,
			detail: { operationId: "postFinancialInstitutions" },
			response: MutationReturn,
		},
	)
	.patch(
		"/:id",
		async ({ body, params, request }) =>
			proposeInstitution(await requireAdmin(request), params.id, "INSTITUTION_UPDATE", {
				name: body.name,
			}),
		{
			body: InstitutionNameBody,
			detail: { operationId: "patchFinancialInstitutionsById" },
			params: t.Object({ id: Id }),
			response: MutationReturn,
		},
	)
	.post(
		"/:id/merge-proposal",
		async ({ params, body, request }) =>
			proposeInstitution(await requireUserId(request), params.id, "MERGE", body),
		{
			body: t.Object({ targetId: Id }),
			detail: { operationId: "postFinancialInstitutionsByIdMergeProposal" },
			params: t.Object({ id: Id }),
			response: MutationReturn,
		},
	)
	.get(
		"/:id/profiles",
		async ({ params, request }) => {
			await visibleInstitution(await requireUserId(request), params.id);
			return queryRaw(
				`SELECT * FROM "FinancialInstitutionProfile" WHERE "institutionId"=$1 ORDER BY "isDefault" DESC,"name"`,
				[params.id],
			);
		},
		{
			detail: { operationId: "getFinancialInstitutionsByIdProfiles" },
			params: t.Object({ id: Id }),
			response: t.Array(ProfileReturn),
		},
	)
	.post(
		"/:id/profiles",
		async ({ params, body, request }) =>
			proposeInstitution(await requireAdmin(request), params.id, "PROFILE", body),
		{
			body: t.Object({ name: t.String({ maxLength: 100, minLength: 1 }) }),
			detail: { operationId: "postFinancialInstitutionsByIdProfiles" },
			params: t.Object({ id: Id }),
			response: MutationReturn,
		},
	)
	.post(
		"/:id/policies",
		async ({ params, body, request }) =>
			proposeInstitution(await requireAdmin(request), params.id, "POLICY", body, body.effectiveDate),
		{
			body: t.Object({
				countryCode: t.Optional(t.String({ maxLength: 2, minLength: 2 })),
				currency: t.String({ maxLength: 3, minLength: 3 }),
				effectiveDate: DateDTO,
				effectiveUntil: t.Optional(DateDTO),
				profileId: Id,
				rules: t.Array(
					t.Object({
						upToBalance: t.Nullable(t.Number({ exclusiveMinimum: 0 })),
						yieldFixedRate: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
						yieldReferencePercentage: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
						yieldReferenceType: t.Optional(
							t.Nullable(
								t.Union([
									t.Literal("CDI"),
									t.Literal("SELIC"),
									t.Literal("IPCA"),
									t.Literal("TR"),
								]),
							),
						),
					}),
					{ maxItems: 20 },
				),
				yieldPeriod: t.Optional(t.Nullable(t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")]))),
				yieldTaxIds: t.Optional(t.Array(Id)),
				yieldTaxRate: t.Optional(t.Nullable(t.Number({ maximum: 100, minimum: 0 }))),
			}),
			detail: { operationId: "postFinancialInstitutionsByIdPolicies" },
			params: t.Object({ id: Id }),
			response: MutationReturn,
		},
	)
	.get(
		"/:id/profile-history",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await visibleInstitution(userId, params.id);
			return queryRaw(
				`SELECT c.*,p."name" FROM "UserInstitutionProfileChange" c JOIN "UserFinancialInstitution" l ON l."id"=c."linkId" JOIN "FinancialInstitutionProfile" p ON p."id"=c."profileId" WHERE l."userId"=$1 AND l."institutionId"=$2 ORDER BY c."effectiveDate"`,
				[userId, params.id],
			);
		},
		{
			detail: { operationId: "getFinancialInstitutionsByIdProfileHistory" },
			params: t.Object({ id: Id }),
			response: t.Array(ChangeReturn),
		},
	)
	.post(
		"/:id/profile-history",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			await visibleInstitution(userId, params.id);
			const result = await withRawTransaction(async query => {
				const [profile] = await query(
					`SELECT "id" FROM "FinancialInstitutionProfile" WHERE "id"=$1 AND "institutionId"=$2`,
					[body.profileId, params.id],
				);
				if (!profile) throw new HttpException("Perfil não encontrado", 404);
				const [link] = await query(
					`INSERT INTO "UserFinancialInstitution" ("id","userId","institutionId","globalRulesFrom","updatedAt") VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT ("userId","institutionId") DO UPDATE SET "globalRulesFrom"=LEAST(COALESCE("UserFinancialInstitution"."globalRulesFrom",EXCLUDED."globalRulesFrom"),EXCLUDED."globalRulesFrom"),"updatedAt"=NOW() RETURNING "id"`,
					[crypto.randomUUID(), userId, params.id, body.effectiveDate],
				);
				const [change] = await query<typeof ChangeReturn.static>(
					`INSERT INTO "UserInstitutionProfileChange" ("id","linkId","profileId","effectiveDate","updatedAt") VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT ("linkId","effectiveDate") DO UPDATE SET "profileId"=EXCLUDED."profileId","updatedAt"=NOW() RETURNING *`,
					[crypto.randomUUID(), link.id, body.profileId, body.effectiveDate],
				);
				await new PostgresOutbox().append(
					createEventEnvelope({
						aggregateId: params.id,
						aggregateType: "account",
						correlationId: change.id,
						eventType: "account.institution.profile.changed",
						payload: { effectiveDate: body.effectiveDate },
						userIds: [userId],
					}),
				);
				return change;
			});
			const accounts = await queryRaw<{ id: string }>(
				`SELECT "id" FROM "FinancialAccount" WHERE "userId"=$1 AND "institutionId"=$2`,
				[userId, params.id],
			);
			for (const account of accounts)
				await enqueueAccountYieldRecalculation(
					account.id,
					new Date(`${body.effectiveDate}T00:00:00`),
					`institution-profile:${result.id}`,
				);
			return result;
		},
		{
			body: t.Object({ effectiveDate: DateDTO, profileId: Id }),
			detail: { operationId: "postFinancialInstitutionsByIdProfileHistory" },
			params: t.Object({ id: Id }),
			response: ChangeReturn,
		},
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await visibleInstitution(userId, params.id);
			await withRawTransaction(async query => {
				await query(
					`UPDATE "FinancialAccount" SET "institutionId"=NULL,"updatedAt"=NOW() WHERE "institutionId"=$1 AND "userId"=$2`,
					[params.id, userId],
				);
				await query(
					`DELETE FROM "UserFinancialInstitution" WHERE "institutionId"=$1 AND "userId"=$2`,
					[params.id, userId],
				);
			});
			return { success: true };
		},
		{
			detail: { operationId: "deleteFinancialInstitutionsById" },
			params: t.Object({ id: Id }),
			response: t.Object({ success: t.Boolean() }),
		},
	)
	.get(
		"/proposals",
		async ({ request }) =>
			queryRaw<typeof ProposalReturn.static>(
				`SELECT * FROM "FinancialInstitutionProposal" WHERE "authorId"=$1 ORDER BY "createdAt" DESC`,
				[await requireUserId(request)],
			),
		{ detail: { operationId: "getFinancialInstitutionsProposals" }, response: t.Array(ProposalReturn) },
	)
	.get(
		"/review/pending-count",
		async ({ request }) => {
			await requireAdmin(request);
			const [row] = await queryRaw<{ count: number }>(
				`SELECT COUNT(*)::int AS "count" FROM "FinancialInstitutionProposal" WHERE "status"='PENDING'`,
			);
			return { count: row?.count ?? 0 };
		},
		{
			detail: { operationId: "getFinancialInstitutionsReviewPendingCount" },
			response: t.Object({ count: t.Integer() }),
		},
	)
	.get(
		"/review/merge-candidates",
		async ({ request }) => {
			await requireAdmin(request);
			return queryRaw<{ normalizedName: string; institutions: (typeof InstitutionReturn.static)[] }>(
				`SELECT "normalizedName",json_agg(to_jsonb(i) ORDER BY "id") AS institutions FROM "FinancialInstitution" i GROUP BY "normalizedName" HAVING COUNT(*)>1 ORDER BY "normalizedName"`,
			);
		},
		{
			detail: { operationId: "getFinancialInstitutionsReviewMergeCandidates" },
			response: t.Array(
				t.Object({ institutions: t.Array(InstitutionReturn), normalizedName: t.String() }),
			),
		},
	)
	.get(
		"/review/proposals",
		async ({ request }) => {
			await requireAdmin(request);
			return queryRaw(
				`SELECT p.*,i."name",i."version" FROM "FinancialInstitutionProposal" p LEFT JOIN "FinancialInstitution" i ON i."id"=p."institutionId" ORDER BY p."createdAt" DESC`,
			);
		},
		{
			detail: { operationId: "getFinancialInstitutionsReviewProposals" },
			response: t.Array(
				t.Object(
					{
						...ProposalReturn.properties,
						name: t.Nullable(t.String()),
						version: t.Nullable(t.Number()),
					},
					{ additionalProperties: true },
				),
			),
		},
	)
	.get(
		"/review/proposals/:id/profile-history",
		async ({ request, params, query }) => {
			await requireAdmin(request);
			return queryRaw<{ institutionId: string; name: string; effectiveDate: Date }>(
				`SELECT l."institutionId",p."name",c."effectiveDate" FROM "UserInstitutionProfileChange" c JOIN "UserFinancialInstitution" l ON l."id"=c."linkId" JOIN "FinancialInstitutionProfile" p ON p."id"=c."profileId" JOIN "FinancialInstitutionProposal" proposal ON proposal."authorId"=l."userId" WHERE proposal."id"=$1 AND (l."institutionId"=proposal."institutionId" OR l."institutionId"=$2) ORDER BY c."effectiveDate"`,
				[params.id, query.targetId ?? null],
			);
		},
		{
			detail: { operationId: "getFinancialInstitutionsReviewProposalsByIdProfileHistory" },
			params: t.Object({ id: Id }),
			query: t.Object({ targetId: t.Optional(Id) }),
			response: t.Array(
				t.Object({
					effectiveDate: t.Union([t.Date(), t.String()]),
					institutionId: t.String(),
					name: t.String(),
				}),
			),
		},
	)
	.post(
		"/review/proposals/:id",
		async ({ request, params, body }) =>
			reviewInstitutionProposal(
				await requireAdmin(request),
				params.id,
				body.action,
				body.reason,
				body.targetId,
				body.confirmedVersion,
				body.profileResolution,
			),
		{
			body: t.Object({
				action: t.Union([t.Literal("APPROVE"), t.Literal("REJECT"), t.Literal("ASSOCIATE")]),
				confirmedVersion: t.Optional(t.Integer({ minimum: 1 })),
				profileResolution: t.Optional(t.Array(t.Object({ effectiveDate: DateDTO, profileId: Id }))),
				reason: t.Optional(t.String({ maxLength: 2000 })),
				targetId: t.Optional(Id),
			}),
			detail: { operationId: "postFinancialInstitutionsReviewProposalsById" },
			params: t.Object({ id: Id }),
			response: t.Object({ id: t.String(), status: t.String() }),
		},
	)
	.get(
		"/notifications",
		async ({ request }) =>
			queryRaw(`SELECT * FROM "AppNotification" WHERE "userId"=$1 ORDER BY "createdAt" DESC`, [
				await requireUserId(request),
			]),
		{
			detail: { operationId: "getFinancialInstitutionsNotifications" },
			response: t.Array(NotificationReturn),
		},
	)
	.post(
		"/notifications/:id/read",
		async ({ params, request }) => {
			await queryRaw(`UPDATE "AppNotification" SET "readAt"=NOW() WHERE "id"=$1 AND "userId"=$2`, [
				params.id,
				await requireUserId(request),
			]);
			return { success: true };
		},
		{
			detail: { operationId: "postFinancialInstitutionsNotificationsByIdRead" },
			params: t.Object({ id: Id }),
			response: t.Object({ success: t.Boolean() }),
		},
	);
