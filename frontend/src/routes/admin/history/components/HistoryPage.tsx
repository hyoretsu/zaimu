import { AdminPageLayout } from "../../components/AdminPageLayout";
import { FinancialHistoryAdmin } from "./FinancialHistoryAdmin";

export function HistoryPage() {
	return (
		<AdminPageLayout
			description="Consulte os dados salvos de juros e conversões e identifique períodos sem cobertura."
			title="Histórico financeiro"
		>
			<FinancialHistoryAdmin />
		</AdminPageLayout>
	);
}
