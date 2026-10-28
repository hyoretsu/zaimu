import type { LoanCharge } from "@zaimu/finance/loan-contract";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Input } from "@/components/ui/Input";
import { MoneyField } from "@/components/ui/MoneyField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
export function LoanChargeRow({
	value,
	index,
	currency,
	onChange,
	onRemove,
}: {
	value: LoanCharge;
	index: number;
	currency: string;
	onChange: (value: LoanCharge) => void;
	onRemove: () => void;
}) {
	const [name, setName] = useDebouncedInput(value.name, name => onChange({ ...value, name }));
	return (
		<div className="space-y-2 rounded-xl border p-3">
			<label className="grid gap-2" htmlFor={`charge-name-${index}`}>
				Nome do encargo
				<Input
					id={`charge-name-${index}`}
					name={`charge-name-${index}`}
					onChange={e => setName(e.currentTarget.value)}
					placeholder="Ex: Seguro mensal"
					type="text"
					value={name}
				/>
			</label>
			<MoneyField
				currencyCode={currency}
				id={`charge-amount-${index}`}
				label="Valor"
				onValueChange={v => onChange({ ...value, amount: Number(v) })}
				value={String(value.amount)}
			/>
			<CheckboxField
				checkboxProps={{
					checked: value.financed,
					disabled: value.recurring,
					onCheckedChange: c => onChange({ ...value, financed: c === true }),
				}}
			>
				Financiado no principal
			</CheckboxField>
			<CheckboxField
				checkboxProps={{
					checked: value.recurring,
					disabled: value.financed,
					onCheckedChange: c => onChange({ ...value, recurring: c === true }),
				}}
			>
				Cobrado em cada parcela
			</CheckboxField>
			<Button onClick={onRemove} type="button" variant="outline">
				<LuTrash2 />
				Remover encargo
			</Button>
		</div>
	);
}
