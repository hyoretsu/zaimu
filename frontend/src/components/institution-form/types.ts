import type { InstitutionCardRules } from "@zaimu/finance/institution-card-rules";
import type { FinancialInstitutionYieldPolicy, PostFinancialInstitutionsBodyJson } from "@/lib/api";

export type InstitutionFormMode = "admin" | "suggest";

/** Body shared by the user and admin create/edit endpoints; only changed fields are sent. */
export type InstitutionProposalBody = PostFinancialInstitutionsBodyJson;

/** The catalog entry being edited (the admin catalog row or the user-visible institution). */
export interface InstitutionFormSource {
	aliases?: string[];
	creditCardRules?: InstitutionCardRules | null;
	creditInstallmentRemainderOnFirst?: boolean;
	creditStatementClosingInclusive?: boolean;
	currency?: string;
	id: string;
	name: string;
	operatingCountryCodes?: string[];
}

export interface ExistingProfile {
	creditCardRules: InstitutionCardRules | null;
	id: string;
	isDefault: boolean;
	name: string;
}

export interface NewProfileDraft {
	key: string;
	name: string;
	/** `null` means the profile inherits the institution rules. */
	rules: InstitutionCardRules | null;
}

/** A yield policy accumulated in the form; targets an existing profile by id or a new one by name. */
export interface PolicyDraft {
	key: string;
	policy: FinancialInstitutionYieldPolicy;
	profileId?: string;
	profileName?: string;
}

export interface InstitutionFormState {
	aliases: string;
	closingInclusive: boolean;
	countries: string[];
	currency: string;
	name: string;
	newProfiles: NewProfileDraft[];
	policies: PolicyDraft[];
	/** Rules edited for existing profiles; `null` removes the profile's own rules. */
	profileRules: Record<string, InstitutionCardRules | null>;
	remainderOnFirst: boolean;
	rules: InstitutionCardRules;
}

/** Draft kept for recovery when a background submission fails. */
export interface InstitutionFormDraft {
	institution?: InstitutionFormSource;
	state: InstitutionFormState;
}
