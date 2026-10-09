import type { RecurrenceUnit } from "@zaimu/finance/recurrence";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { weekdayOptions } from "./constants";
import { RecurrenceNumberField } from "./RecurrenceNumberField";
import { type UnifiedRecurringDraft, unitLabels } from "./unified-types";
export function RecurrenceScheduleFields({
	draft,
	set,
	disabled = false,
}: {
	draft: UnifiedRecurringDraft;
	disabled?: boolean;
	set: <K extends keyof UnifiedRecurringDraft>(key: K, value: UnifiedRecurringDraft[K]) => void;
}) {
	return (
		<div className="grid gap-4">
			<FormFieldRow>
				<RecurrenceNumberField
					label="Repetir a cada"
					name="recurrence-interval"
					onChange={value => set("interval", value)}
					placeholder="Ex: 3"
					value={draft.interval}
				/>
				<div className="grid content-start gap-2">
					<CustomSelect
						disabled={disabled}
						label="Unidade"
						onValueChange={value => set("unit", value as RecurrenceUnit)}
						options={Object.entries(unitLabels).map(([value, label]) => ({ label, value }))}
						placeholder="Selecione unidade"
						required
						value={draft.unit}
					/>
				</div>
			</FormFieldRow>
			<FormFieldRow>
				<DateField
					disabled={disabled}
					id="recurrence-start"
					label="Data inicial"
					name="recurrence-start"
					onValueChange={value => set("startDate", value)}
					placeholder="Ex: 01/10/2026"
					required
					value={draft.startDate}
				/>
				<DateField
					disabled={disabled}
					id="recurrence-end"
					label="Data final (opcional)"
					min={draft.startDate}
					name="recurrence-end"
					onValueChange={value => set("endDate", value)}
					placeholder="Sem data final"
					value={draft.endDate}
				/>
			</FormFieldRow>
			{(draft.unit === "MONTH" || draft.unit === "YEAR") && (
				<RecurrenceNumberField
					label="Dia do mês"
					name="recurrence-day"
					onChange={value => set("dayOfMonth", value)}
					placeholder="Ex: 31"
					value={draft.dayOfMonth}
				/>
			)}
			{draft.unit === "WEEK" && (
				<div className="grid gap-2">
					<CustomSelect
						disabled={disabled}
						label="Dia da semana"
						onValueChange={value => set("dayOfWeek", value)}
						options={[...weekdayOptions]}
						placeholder="Selecione dia"
						value={draft.dayOfWeek}
					/>
				</div>
			)}
			<p className="text-muted-foreground text-xs">
				Geração automática na data agendada. Datas futuras são previsões. Em meses menores, usamos último dia
				disponível.
			</p>
		</div>
	);
}
