import { AdminPageLayout } from "../../components/AdminPageLayout";
import { InstitutionCatalog } from "./InstitutionCatalog";
import { InstitutionReviewQueue } from "./InstitutionReviewQueue";
export function InstitutionsPage() {
	return (
		<AdminPageLayout
			description="Consulte o catálogo global e revise propostas de instituições, perfis e políticas de rendimento."
			title="Instituições"
		>
			<InstitutionCatalog />
			<InstitutionReviewQueue />
		</AdminPageLayout>
	);
}
