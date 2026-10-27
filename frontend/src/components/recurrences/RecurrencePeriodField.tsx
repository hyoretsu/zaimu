import type { RecurrenceUnit } from "@zaimu/finance/recurrence";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { MonthYearPicker } from "@/components/ui/DateRangePicker/MonthYearPicker";
import { RequiredMark } from "@/components/ui/RequiredMark";

export function RecurrencePeriodField({
	id,
	unit,
	value,
	onChange,
	disabled,
}: {
	id: string;
	unit?: RecurrenceUnit;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
}) {
	if (unit === "MONTH")
		return (
			<fieldset className="space-y-2" disabled={disabled}>
				<legend className="mb-2 text-sm font-medium">
					Mês da ocorrência <RequiredMark />
				</legend>
				<MonthYearPicker
					disabled={disabled}
					month={new Date(`${value}T12:00:00`)}
					onMonthChange={date => {
						if (!disabled)
							onChange(
								`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`,
							);
					}}
				/>
			</fieldset>
		);
	if (unit === "YEAR")
		return (
			<div className="space-y-2">
				<span className="text-sm font-medium">
					Ano da ocorrência <RequiredMark />
				</span>
				<CustomSelect
					disabled={disabled}
					label="Ano da ocorrência"
					onValueChange={year => {
						if (year) onChange(`${year}-01-01`);
					}}
					options={Array.from({ length: 111 }, (_, i) => {
						const year = String(new Date().getFullYear() - 100 + i);
						return { label: year, value: year };
					})}
					placeholder="Selecione o ano"
					required
					value={value.slice(0, 4)}
				/>
			</div>
		);
	return (
		<DateField
			description={
				unit === "WEEK" ? "Escolha qualquer dia da semana, de segunda a domingo." : undefined
			}
			disabled={disabled}
			id={id}
			label={unit === "WEEK" ? "Semana da ocorrência" : "Dia da ocorrência"}
			name="occurrencePeriod"
			onValueChange={onChange}
			required
			value={value}
		/>
	);
}
