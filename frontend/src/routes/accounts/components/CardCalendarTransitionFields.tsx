import { type CardCalendarPeriod, calendarCycles } from "@zaimu/finance/credit-card";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { formatLocalDate } from "@/lib/date";

export function CardCalendarTransitionFields({
	value,
	onChange,
}: {
	value: CardCalendarPeriod;
	onChange: (value: CardCalendarPeriod) => void;
}) {
	const cycles = calendarCycles(
		{ ...value, calendarHistory: [value] },
		value.firstStatementDate,
		`${Number(value.firstStatementDate.slice(0, 4)) + 1}-12-31`,
	).slice(0, 3);
	return (
		<div className="space-y-4 rounded-lg border p-4">
			<p className="font-medium">Troca do calendário da fatura</p>
			<FormFieldRow className="sm:grid-cols-2">
				<DateField
					id="calendar-effective"
					label="Vigência"
					name="calendar-effective"
					onValueChange={effectiveDate => onChange({ ...value, effectiveDate })}
					required
					value={value.effectiveDate}
				/>
				<CustomSelect
					label="Aplicar mudança"
					onValueChange={transitionMode =>
						onChange({ ...value, transitionMode: transitionMode as CardCalendarPeriod["transitionMode"] })
					}
					options={[
						{ label: "Permitir ciclo extra no mês", value: "EXTRA_CYCLE" },
						{ label: "Próximo ciclo mensal", value: "NEXT_CYCLE" },
					]}
					placeholder="Ex: Ciclo extra no mês"
					value={value.transitionMode}
				/>
			</FormFieldRow>
			<FormFieldRow className="sm:grid-cols-2">
				<DateField
					id="calendar-first-closing"
					label="Primeiro fechamento"
					name="calendar-first-closing"
					onValueChange={firstStatementDate => onChange({ ...value, firstStatementDate })}
					required
					value={value.firstStatementDate}
				/>
				<DateField
					id="calendar-first-due"
					label="Primeiro vencimento"
					name="calendar-first-due"
					onValueChange={firstDueDate => onChange({ ...value, firstDueDate })}
					required
					value={value.firstDueDate}
				/>
			</FormFieldRow>
			<CustomSelect
				label="Parcelas na transição"
				onValueChange={installmentMode =>
					onChange({ ...value, installmentMode: installmentMode as CardCalendarPeriod["installmentMode"] })
				}
				options={[
					{ label: "Uma parcela por ciclo", value: "PER_CYCLE" },
					{ label: "Uma parcela por mês", value: "PER_MONTH" },
				]}
				placeholder="Ex: Uma parcela por ciclo"
				value={value.installmentMode}
			/>
			<div aria-live="polite" className="space-y-1 text-muted-foreground text-sm">
				<p>Próximas faturas - fechamento / vencimento</p>
				{cycles.map(cycle => (
					<p key={cycle.statementDate}>
						{formatLocalDate(cycle.statementDate)} / {formatLocalDate(cycle.dueDate)}
					</p>
				))}
			</div>
		</div>
	);
}
