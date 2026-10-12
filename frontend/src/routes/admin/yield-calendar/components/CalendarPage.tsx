import { AdminPageLayout } from "../../components/AdminPageLayout";
import { CalendarContent } from "./CalendarContent";

export function CalendarPage() {
	return (
		<AdminPageLayout
			description="Calendário nacional do país da conta define dias úteis. Overrides administrativos preservam correções."
			title="Moedas, países e feriados"
		>
			{header => <CalendarContent header={header} />}
		</AdminPageLayout>
	);
}
