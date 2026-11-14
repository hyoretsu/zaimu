import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormSection } from "@/components/ui/FormSection";
import type { InstitutionFormState } from "./types";

export function InvoiceSection({
	disabled,
	onChange,
	state,
}: {
	disabled: boolean;
	onChange: (patch: Partial<InstitutionFormState>) => void;
	state: InstitutionFormState;
}) {
	return (
		<FormSection
			summary={`Fechamento ${state.closingInclusive ? "inclusivo" : "exclusivo"} - resto das parcelas ${
				state.remainderOnFirst ? "na primeira parcela" : "distribuído"
			}`}
			title="Fatura e parcelas"
		>
			<CustomSelect
				disabled={disabled}
				label="Data de fechamento da fatura"
				onValueChange={value => onChange({ closingInclusive: value === "inclusive" })}
				options={[
					{
						label: "Exclusiva - compras do dia entram na próxima fatura (padrão)",
						value: "exclusive",
					},
					{ label: "Inclusiva - compras do dia entram na fatura atual", value: "inclusive" },
				]}
				placeholder="Ex: Exclusiva"
				value={state.closingInclusive ? "inclusive" : "exclusive"}
			/>
			<CheckboxField
				checkboxProps={{
					checked: state.remainderOnFirst,
					disabled,
					onCheckedChange: checked => onChange({ remainderOnFirst: checked === true }),
				}}
			>
				Concentrar o resto da divisão das parcelas na primeira parcela
			</CheckboxField>
		</FormSection>
	);
}
