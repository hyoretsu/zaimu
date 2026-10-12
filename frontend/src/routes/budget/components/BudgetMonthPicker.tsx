import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LuCalendarDays, LuChevronDown } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { MonthYearPicker } from "@/components/ui/DateRangePicker/MonthYearPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

export function BudgetMonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
	const date = new Date(`${month}-01T12:00:00`);
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button aria-label="Selecionar mês do orçamento" className="min-w-0" size="sm" variant="outline">
					<LuCalendarDays />
					<span className="truncate capitalize">{format(date, "MMMM 'de' yyyy", { locale: ptBR })}</span>
					<LuChevronDown />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72">
				<MonthYearPicker month={date} onMonthChange={value => onChange(format(value, "yyyy-MM"))} />
			</PopoverContent>
		</Popover>
	);
}
