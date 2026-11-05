import type {
	InstitutionYieldPolicy,
	YieldAccountType,
	YieldPeriod,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import { db, queryRows } from "~/shared/infra/sql";

export async function getFinancialInstitutionYieldPolicies(institutionIds: string[]) {
	const policiesByInstitutionId = new Map<string, InstitutionYieldPolicy[]>();
	if (institutionIds.length === 0) return policiesByInstitutionId;
	const policies = await queryRows(
		db.sql.public.FinancialInstitutionYieldPolicy.select(
			"id",
			"financialInstitutionId",
			"accountType",
			"currency",
			"profileId",
			"countryCode",
			"effectiveUntil",
			"status",
			"effectiveDate",
			"yieldPeriod",
			"yieldTaxIds",
			"yieldTaxRate",
			"yieldTaxMode",
			"yieldTaxModes",
		)
			.where((fields, functions) => functions.in(fields.financialInstitutionId, institutionIds))
			.orderBy("effectiveDate", { direction: "asc" })
			.build(),
	);
	const rules = policies.length
		? await queryRows(
				db.sql.public.FinancialInstitutionYieldRule.select(
					"financialYieldPolicyId",
					"position",
					"upToBalance",
					"yieldFixedRate",
					"yieldReferencePercentage",
					"yieldReferenceType",
				)
					.where((fields, functions) =>
						functions.in(
							fields.financialYieldPolicyId,
							policies.map(policy => policy.id),
						),
					)
					.orderBy("position", { direction: "asc" })
					.build(),
			)
		: [];
	const rulesByPolicyId = new Map<string, typeof rules>();
	for (const rule of rules) {
		const policyRules = rulesByPolicyId.get(rule.financialYieldPolicyId) ?? [];
		policyRules.push(rule);
		rulesByPolicyId.set(rule.financialYieldPolicyId, policyRules);
	}
	for (const policy of policies) {
		const institutionPolicies = policiesByInstitutionId.get(policy.financialInstitutionId) ?? [];
		institutionPolicies.push({
			accountType: policy.accountType as YieldAccountType | null,
			countryCode: policy.countryCode,
			currency: policy.currency,
			effectiveDate: new Date(policy.effectiveDate),
			effectiveUntil: policy.effectiveUntil === null ? null : new Date(policy.effectiveUntil),
			profileId: policy.profileId,
			rules: (rulesByPolicyId.get(policy.id) ?? []).map(rule => ({
				upToBalance: rule.upToBalance === null ? null : Number(rule.upToBalance),
				yieldFixedRate: rule.yieldFixedRate === null ? null : Number(rule.yieldFixedRate),
				yieldReferencePercentage:
					rule.yieldReferencePercentage === null ? null : Number(rule.yieldReferencePercentage),
				yieldReferenceType: rule.yieldReferenceType as "CDI" | "SELIC" | "IPCA" | "TR" | null,
			})),
			status: policy.status as "APPROVED" | "PENDING" | "REJECTED",
			yieldPeriod: policy.yieldPeriod as null | YieldPeriod,
			yieldTaxIds: policy.yieldTaxIds as string[] | null,
			yieldTaxMode: policy.yieldTaxMode as "DAILY" | "ON_REDEMPTION",
			yieldTaxModes: policy.yieldTaxModes as null | Record<string, "DAILY" | "ON_REDEMPTION">,
			yieldTaxRate: policy.yieldTaxRate === null ? null : Number(policy.yieldTaxRate),
		});
		policiesByInstitutionId.set(policy.financialInstitutionId, institutionPolicies);
	}
	return policiesByInstitutionId;
}
