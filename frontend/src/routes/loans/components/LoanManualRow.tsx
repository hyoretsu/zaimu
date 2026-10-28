import type { LoanContractTerms } from "@zaimu/finance/loan-contract";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
type Row = NonNullable<LoanContractTerms["manualSchedule"]>[number];
export function LoanManualRow({
	value,
	index,
	currency,
	onChange,
	onRemove,
}: {
	value: Row;
	index: number;
	currency: string;
	onChange: (row: Row) => void;
	onRemove: () => void;
}) {
	return (
		<div className="space-y-2 rounded-xl border p-3">
			<p>Parcela {index + 1}</p>
			<DateField
				id={`manual-date-${index}`}
				label="Vencimento"
				name={`manual-date-${index}`}
				onValueChange={dueDate => onChange({ ...value, dueDate })}
				required
				value={value.dueDate}
			/>
			<FormFieldRow>
				{(
					[
						["principal", "Principal"],
						["interest", "Juros"],
						["charges", "Encargos"],
					] as const
				).map(([key, label]) => (
					<MoneyField
						currencyCode={currency}
						id={`manual-${key}-${index}`}
						key={key}
						label={label}
						onValueChange={v => onChange({ ...value, [key]: Number(v) })}
						value={String(value[key])}
					/>
				))}
			</FormFieldRow>
			<Button onClick={onRemove} type="button" variant="outline">
				<LuTrash2 />
				Remover parcela
			</Button>
		</div>
	);
}
