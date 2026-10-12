import { AdminPageLayout } from "../../components/AdminPageLayout";
import { FinancialHistoryAdmin } from "./FinancialHistoryAdmin";

export function HistoryPage() {
	return (
		<AdminPageLayout
			description="Consulte fontes, vigências e lacunas financeiras; revise propostas institucionais."
			title="Cobertura financeira"
		>
			{header => <FinancialHistoryAdmin header={header} />}
		</AdminPageLayout>
	);
}
