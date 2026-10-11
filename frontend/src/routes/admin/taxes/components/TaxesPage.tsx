import { AdminPageLayout } from "../../components/AdminPageLayout";
import { TaxCatalogAdmin } from "./TaxCatalogAdmin";

export function TaxesPage() {
	return (
		<AdminPageLayout
			description="Gerencie impostos globais, faixas e versões sem alterar o histórico."
			title="Impostos"
		>
			<TaxCatalogAdmin />
		</AdminPageLayout>
	);
}
