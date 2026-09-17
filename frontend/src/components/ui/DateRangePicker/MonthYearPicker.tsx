import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CustomSelect } from "@/components/ui/CustomSelect";

interface MonthYearPickerProps {
	month: Date;
	onMonthChange: (month: Date) => void;
}

const monthOptions = Array.from({ length: 12 }, (_, month) => ({
	label: format(new Date(2026, month, 1), "MMMM", { locale: ptBR }),
	value: String(month),
}));

export function MonthYearPicker({ month, onMonthChange }: MonthYearPickerProps) {
	const currentYear = new Date().getFullYear();
	const yearOptions = Array.from({ length: 111 }, (_, index) => {
		const year = currentYear - 100 + index;
		return { label: String(year), value: String(year) };
	});
	const updateMonth = (nextMonth = month.getMonth(), nextYear = month.getFullYear()) => {
		onMonthChange(startOfMonth(new Date(nextYear, nextMonth, 1)));
	};

	return (
		<div className="grid grid-cols-2 gap-3">
			<CustomSelect
				label="Mês"
				onValueChange={nextMonth => updateMonth(Number(nextMonth))}
				options={monthOptions}
				placeholder="Selecione o mês"
				sortOptions={false}
				value={String(month.getMonth())}
			/>
			<CustomSelect
				label="Ano"
				onValueChange={nextYear => updateMonth(undefined, Number(nextYear))}
				options={yearOptions}
				placeholder="Selecione o ano"
				sortOptions={false}
				value={String(month.getFullYear())}
			/>
		</div>
	);
}
