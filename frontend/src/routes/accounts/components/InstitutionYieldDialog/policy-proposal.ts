import type { FinancialInstitutionYieldPolicy, postFinancialInstitutionsByIdPolicies } from "@/lib/api";

type PolicyProposalBody = Parameters<typeof postFinancialInstitutionsByIdPolicies>[1];

/** Maps the editor's policy draft to the proposal payload; throws when profile or date is missing. */
export function toPolicyProposalBody(
	policy: Omit<FinancialInstitutionYieldPolicy, "effectiveDate">,
): PolicyProposalBody {
	const { requestedEffectiveDate, profileId, yieldTaxIds, ...body } = policy;
	if (!requestedEffectiveDate || !profileId) throw new Error("Selecione perfil e data de vigência.");
	return {
		...body,
		countryCode: body.countryCode ?? undefined,
		effectiveDate: requestedEffectiveDate,
		effectiveUntil: body.effectiveUntil ?? undefined,
		profileId,
		rules: body.rules.map(rule => ({ ...rule, upToBalance: rule.upToBalance ?? null })),
		yieldTaxIds: yieldTaxIds ?? undefined,
	};
}
