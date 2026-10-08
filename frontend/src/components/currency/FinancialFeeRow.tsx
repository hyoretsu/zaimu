import { LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { FinancialFee } from "@/lib/api";

const presets = ["IOF", "Spread", "Imposto", "Tarifa", "Juros", "Multa"];
export function FinancialFeeRow({
	fee,
	onChange,
	onRemove,
	currencyCode,
	index,
}: {
	fee: FinancialFee;
	onChange: (fee: FinancialFee) => void;
	onRemove: () => void;
	currencyCode: string;
	index: number;
}) {
	const [name, setName] = useDebouncedInput(fee.name, name => onChange({ ...fee, name }));
	const [amount, setAmount] = useDebouncedInput(String(fee.amount), value =>
		onChange({ ...fee, amount: Number(value.replace(",", ".")) || 0 }),
	);
	return (
		<div className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border p-3">
			<CustomSelect
				label="Nome da taxa"
				onValueChange={name => onChange({ ...fee, name: name === "CUSTOM" ? "" : name })}
				options={[
					{ label: "Escrever outro nome", special: true, value: "CUSTOM" },
					...presets.map(value => ({ label: value, value })),
				]}
				placeholder="Ex: IOF"
				value={presets.includes(fee.name) ? fee.name : "CUSTOM"}
			/>
			{!presets.includes(fee.name) ? (
				<FormField
					id={`fee-name-${index}`}
					label="Nome personalizado"
					name={`fee-name-${index}`}
					onChange={event => setName(event.currentTarget.value)}
					placeholder="Ex: Taxa de serviço"
					required
					type="text"
					value={name}
				/>
			) : null}
			<CustomSelect
				label="Cálculo"
				onValueChange={type => onChange({ ...fee, type: type as FinancialFee["type"] })}
				options={[
					{ label: "Valor fixo", value: "FIXED" },
					{ label: "Percentual", value: "PERCENTAGE" },
				]}
				placeholder="Selecione o cálculo"
				value={fee.type}
			/>
			{fee.type === "FIXED" ? (
				<MoneyField
					currencyCode={currencyCode}
					id={`fee-amount-${index}`}
					label="Valor da taxa"
					onValueChange={amount => onChange({ ...fee, amount: Number(amount) || 0 })}
					value={String(fee.amount || "")}
				/>
			) : (
				<NumericField
					id={`fee-percent-${index}`}
					label="Percentual"
					onValueChange={setAmount}
					placeholder="Ex: 3,38%"
					suffix="%"
					value={amount}
				/>
			)}
			<ActionGroup>
				<Button aria-label="Remover taxa" onClick={onRemove} size="icon" type="button" variant="outline">
					<LuTrash2 />
				</Button>
			</ActionGroup>
		</div>
	);
}
