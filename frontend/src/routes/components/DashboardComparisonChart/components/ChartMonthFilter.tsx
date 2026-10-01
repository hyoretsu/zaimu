import { CustomSelect } from "@/components/ui/CustomSelect";

const months = Array.from({ length: 12 }, (_, month) => ({
	label: new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, month, 1)),
	value: String(month),
}));

export function ChartMonthFilter({ onChange, value }: { onChange: (value: Date) => void; value: Date }) {
	const currentYear = new Date().getFullYear();
	const firstYear = Math.min(currentYear - 10, value.getFullYear() - 1);
	const lastYear = Math.max(currentYear + 10, value.getFullYear() + 1);
	const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
		const year = String(firstYear + index);
		return { label: year, value: year };
	});
	return (
		<div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
			<CustomSelect
				label="Mês de referência"
				onValueChange={month => onChange(new Date(value.getFullYear(), Number(month), 1))}
				options={months}
				placeholder="Ex: outubro"
				sortOptions={false}
				value={String(value.getMonth())}
			/>
			<CustomSelect
				label="Ano de referência"
				onValueChange={year => onChange(new Date(Number(year), value.getMonth(), 1))}
				options={years}
				placeholder="Ex: 2026"
				sortOptions={false}
				value={String(value.getFullYear())}
			/>
		</div>
	);
}
