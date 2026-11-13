import { t } from "elysia";
import { InstitutionCardRulesDTO } from "./institution-card-rules";
import { InstitutionCountriesBody } from "./institution-countries";
import { InstitutionPolicyProposal } from "./institution-policy";

/** A profile touched by the proposal: with `id` its card rules change, without it the profile is created. */
export const InstitutionProfileProposal = t.Object({
	creditCardRules: t.Optional(t.Nullable(InstitutionCardRulesDTO)),
	id: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
	name: t.String({ maxLength: 100, minLength: 1, pattern: "\\S" }),
});

/** Only the fields the author changed; the admin reviews them as a single diff against the current catalog entry. */
export const InstitutionUpdateProposalBody = t.Object({
	...t.Partial(InstitutionCountriesBody).properties,
	creditCardRules: t.Optional(InstitutionCardRulesDTO),
	creditInstallmentRemainderOnFirst: t.Optional(t.Boolean()),
	currency: t.Optional(t.String({ maxLength: 3, minLength: 3 })),
	policies: t.Optional(t.Array(InstitutionPolicyProposal, { maxItems: 50 })),
	profiles: t.Optional(t.Array(InstitutionProfileProposal, { maxItems: 20 })),
});
export type InstitutionUpdateProposalBody = typeof InstitutionUpdateProposalBody.static;
