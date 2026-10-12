import type { InstitutionYieldPolicy } from "~/modules/accounts/domain/calculate-financial-account-yields";
import { queryRaw } from "~/shared/infra/sql";
import { getFinancialInstitutionYieldPolicies } from "./get-financial-institution-yield-policies";

interface InstitutionProfileContext {
	accountId: string;
	legacyInstitutionId: string | null;
	legacyInstitutionYieldPolicies?: InstitutionYieldPolicy[];
	defaultInstitutionProfileId: string | null;
	globalRulesFrom: Date | null;
	institutionProfileChanges: { profileId: string; effectiveDate: string }[];
}

/** Load per-user selections, never another user's institution profile history. */
export async function getInstitutionProfileContext(accountIds: string[]) {
	if (!accountIds.length) return new Map<string, InstitutionProfileContext>();
	const rows = await queryRaw<InstitutionProfileContext & Record<string, unknown>>(
		`SELECT a.id AS "accountId", COALESCE(a."legacyInstitutionId",CASE WHEN i."status" <> 'APPROVED' THEN a."institutionId" END) AS "legacyInstitutionId", p.id AS "defaultInstitutionProfileId", l."globalRulesFrom",
	COALESCE((SELECT json_agg(json_build_object('profileId', c."profileId", 'effectiveDate', c."effectiveDate") ORDER BY c."effectiveDate")
	FROM "UserInstitutionProfileChange" c WHERE c."linkId" = l.id), '[]'::json) AS "institutionProfileChanges"
	FROM "FinancialAccount" a
	LEFT JOIN "FinancialInstitution" i ON i."id"=a."institutionId"
	LEFT JOIN "UserFinancialInstitution" l ON l."userId" = a."userId" AND l."institutionId" = a."institutionId"
	LEFT JOIN "FinancialInstitutionProfile" p ON p."institutionId" = a."institutionId" AND p."isDefault" = true
	WHERE a.id = ANY($1)`,
		[accountIds],
	);
	const policies = await getFinancialInstitutionYieldPolicies([
		...new Set(rows.flatMap(row => (row.legacyInstitutionId ? [row.legacyInstitutionId] : []))),
	]);
	return new Map(
		rows.map(row => [
			row.accountId,
			{
				...row,
				legacyInstitutionYieldPolicies: row.legacyInstitutionId
					? policies.get(row.legacyInstitutionId)?.map(policy => ({ ...policy, profileId: null }))
					: undefined,
			},
		]),
	);
}
