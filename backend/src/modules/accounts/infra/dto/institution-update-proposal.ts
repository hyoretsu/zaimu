import { t } from "elysia";
import { InstitutionCountriesBody } from "./institution-countries";

/** Only the fields the author changed; the admin reviews them as a diff against the current catalog entry. */
export const InstitutionUpdateProposalBody = t.Object({
	...t.Partial(InstitutionCountriesBody).properties,
});
export type InstitutionUpdateProposalBody = typeof InstitutionUpdateProposalBody.static;
