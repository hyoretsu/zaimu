import {
	postFinancialInstitutions,
	postFinancialInstitutionsByIdUpdateProposal,
	postFinancialInstitutionsReviewCatalog,
	postFinancialInstitutionsReviewCatalogByIdProposal,
} from "@/lib/api";
import type { InstitutionFormMode, InstitutionFormSource, InstitutionProposalBody } from "./types";

/** One proposal, one request: the user endpoints stay pending, the admin endpoints publish right away. */
export function submitInstitutionProposal(
	mode: InstitutionFormMode,
	institution: InstitutionFormSource | undefined,
	body: InstitutionProposalBody,
) {
	if (mode === "admin")
		return (
			institution
				? postFinancialInstitutionsReviewCatalogByIdProposal({ body, path: { id: institution.id } })
				: postFinancialInstitutionsReviewCatalog({ body })
		).then(result => result.data);
	return (
		institution
			? postFinancialInstitutionsByIdUpdateProposal({ body, path: { id: institution.id } })
			: postFinancialInstitutions({ body })
	).then(result => result.data);
}
