export interface InstitutionCardRules {
	workingDueDate: boolean;
	cashback: null | {
		kind: "CASHBACK" | "POINTS";
		rate: number;
		conversionPoints: number | null;
		conversionAmount: number | null;
		yieldPeriod: "MONTHLY" | "YEARLY" | null;
		yieldReferenceRate: number | null;
		yieldReferencePercentage: number | null;
	};
}
export interface CardRulesProfile {
	id: string;
	isDefault: boolean;
	creditCardRules?: InstitutionCardRules | null;
}
export const defaultCardRules: InstitutionCardRules = { cashback: null, workingDueDate: false };

/** Profile history belongs to the user's institution link, across all its cards. */
export function resolveInstitutionCardRules(
	institution: { creditCardRules?: InstitutionCardRules | null } | null | undefined,
	profiles: CardRulesProfile[] = [],
	changes: { profileId: string; effectiveDate: string }[] = [],
	date = new Date().toISOString().slice(0, 10),
): InstitutionCardRules {
	const active = changes
		.filter(change => change.effectiveDate.slice(0, 10) <= date)
		.toSorted((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
		.at(-1);
	const profile =
		profiles.find(item => item.id === active?.profileId) ?? profiles.find(item => item.isDefault);
	return profile?.creditCardRules ?? institution?.creditCardRules ?? defaultCardRules;
}

export function cardRuleValues(rules: InstitutionCardRules) {
	return {
		cashbackRate: rules.cashback?.rate ?? null,
		cashbackYieldPeriod: rules.cashback?.yieldPeriod ?? null,
		cashbackYieldReferencePercentage: rules.cashback?.yieldReferencePercentage ?? null,
		cashbackYieldReferenceRate: rules.cashback?.yieldReferenceRate ?? null,
		workingDueDate: rules.workingDueDate,
	};
}
