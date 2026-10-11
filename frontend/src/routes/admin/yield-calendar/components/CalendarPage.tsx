import { AdminPageLayout } from "../../components/AdminPageLayout";
import { CalendarContent } from "./CalendarContent";

export function CalendarPage() {
	return (
		<AdminPageLayout
			description="Feriados dos países associados à moeda suspendem o rendimento das contas."
			title="Moedas, países e feriados"
		>
			<CalendarContent />
		</AdminPageLayout>
	);
}
