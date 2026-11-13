import { defaultCardRules, type InstitutionCardRules } from "@zaimu/finance/institution-card-rules";
import { OPEN_START } from "@/routes/accounts/components/InstitutionYieldDialog/policy-selection";
import type {
	ExistingProfile,
	InstitutionFormSource,
	InstitutionFormState,
	InstitutionProposalBody,
	PolicyDraft,
} from "./types";

export const DEFAULT_CURRENCY = "BRL";
export const DEFAULT_PROFILE_NAME = "Padrão";

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(item => b.includes(item));
const sameRules = (a: InstitutionCardRules | null | undefined, b: InstitutionCardRules | null | undefined) =>
	JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const parseAliases = (aliases: string) =>
	aliases
		.split(",")
		.map(alias => alias.trim())
		.filter(Boolean);

export function initialFormState(institution?: InstitutionFormSource): InstitutionFormState {
	return {
		aliases: (institution?.aliases ?? []).join(", "),
		closingInclusive: institution?.creditStatementClosingInclusive ?? false,
		countries: institution?.operatingCountryCodes ?? [],
		currency: institution?.currency ?? DEFAULT_CURRENCY,
		name: institution?.name ?? "",
		newProfiles: [],
		policies: [],
		profileRules: {},
		remainderOnFirst: institution?.creditInstallmentRemainderOnFirst ?? false,
		rules: institution?.creditCardRules ?? defaultCardRules,
	};
}

/** Maps a policy draft to the proposal policy entry; the profile is referenced by id or by new profile name. */
export function policyDraftBody(
	draft: PolicyDraft,
): NonNullable<InstitutionProposalBody["policies"]>[number] {
	const { policy } = draft;
	const { requestedEffectiveDate, yieldTaxIds } = policy;
	return {
		accountType: policy.accountType ?? undefined,
		countryCode: policy.countryCode ?? undefined,
		effectiveDate: (requestedEffectiveDate ?? policy.effectiveDate).slice(0, 10) || OPEN_START,
		effectiveUntil: policy.effectiveUntil ?? undefined,
		profileId: draft.profileId,
		profileName: draft.profileName,
		replacesEffectiveDate: policy.replacesEffectiveDate,
		rules: policy.rules.map(rule => ({ ...rule, upToBalance: rule.upToBalance ?? null })),
		yieldPeriod: policy.yieldPeriod,
		yieldTaxIds: yieldTaxIds ?? undefined,
		yieldTaxMode: policy.yieldTaxMode,
		yieldTaxModes: policy.yieldTaxModes,
		yieldTaxRate: policy.yieldTaxRate,
	};
}

/** Builds the minimal proposal: for an existing institution only fields that differ; for a new one everything filled. */
export function buildProposalBody(
	state: InstitutionFormState,
	institution: InstitutionFormSource | undefined,
	profiles: ExistingProfile[],
): InstitutionProposalBody {
	const body: InstitutionProposalBody = {};
	const name = state.name.trim();
	const aliases = parseAliases(state.aliases);
	if (!institution || name !== institution.name) body.name = name;
	if (institution ? !sameSet(aliases, institution.aliases ?? []) : aliases.length) body.aliases = aliases;
	if (
		institution
			? !sameSet(state.countries, institution.operatingCountryCodes ?? [])
			: state.countries.length
	)
		body.operatingCountryCodes = state.countries;
	if (state.currency !== (institution?.currency ?? DEFAULT_CURRENCY)) body.currency = state.currency;
	if (state.closingInclusive !== (institution?.creditStatementClosingInclusive ?? false))
		body.creditStatementClosingInclusive = state.closingInclusive;
	if (state.remainderOnFirst !== (institution?.creditInstallmentRemainderOnFirst ?? false))
		body.creditInstallmentRemainderOnFirst = state.remainderOnFirst;
	if (!sameRules(state.rules, institution?.creditCardRules ?? defaultCardRules))
		body.creditCardRules = state.rules;
	const profileEntries: NonNullable<InstitutionProposalBody["profiles"]> = [];
	for (const profile of profiles) {
		if (!(profile.id in state.profileRules)) continue;
		const rules = state.profileRules[profile.id];
		if (sameRules(rules, profile.creditCardRules)) continue;
		profileEntries.push({ creditCardRules: rules, id: profile.id, name: profile.name });
	}
	for (const profile of state.newProfiles) {
		const profileName = profile.name.trim();
		if (!profileName) continue;
		profileEntries.push({
			...(profile.rules ? { creditCardRules: profile.rules } : {}),
			name: profileName,
		});
	}
	if (profileEntries.length) body.profiles = profileEntries;
	if (state.policies.length) body.policies = state.policies.map(policyDraftBody);
	return body;
}

/** Names that would collide: new profile names must be unique among existing and new ones. */
export function duplicateProfileName(state: InstitutionFormState, profiles: ExistingProfile[]) {
	const seen = new Set(profiles.map(profile => profile.name.trim().toLowerCase()));
	for (const profile of state.newProfiles) {
		const name = profile.name.trim().toLowerCase();
		if (!name) continue;
		if (seen.has(name)) return profile.name.trim();
		seen.add(name);
	}
	return undefined;
}

/** Reason a card-rules value cannot be sent, shared by every scope. */
export function invalidCardRules(rules: InstitutionCardRules | null | undefined) {
	const reward = rules?.cashback;
	if (!reward) return false;
	return (
		!(reward.rate > 0) ||
		(reward.conversionPoints !== null &&
			(!(reward.conversionPoints > 0) || !(reward.conversionAmount! > 0))) ||
		(reward.yieldPeriod !== null &&
			(!(reward.yieldReferenceRate! > 0) || !(reward.yieldReferencePercentage! > 0)))
	);
}
