import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

export function ImportedPurchaseTaxRow({
	tax,
	index,
	currencyCode,
	onChange,
	onRemove,
}: {
	tax: { name: string; amount: number };
	index: number;
	currencyCode: string;
	onChange: (tax: { name: string; amount: number }) => void;
	onRemove: () => void;
}) {
	const [name, setName] = useDebouncedInput(tax.name, name => onChange({ ...tax, name }));
	return (
		<FormFieldRow className="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-2 has-[[data-slot=money-field]]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
			<FormField
				id={`import-tax-name-${index}`}
				label="Imposto"
				maxLength={100}
				name={`import-tax-name-${index}`}
				onChange={event => setName(event.currentTarget.value)}
				placeholder="Ex: IOF"
				required
				type="text"
				value={name}
			/>
			<MoneyField
				currencyCode={currencyCode}
				id={`import-tax-amount-${index}`}
				label="Valor"
				onValueChange={amount => onChange({ ...tax, amount: Number(amount), name })}
				placeholder="R$ 1,85"
				rawValueName={`import-tax-raw-${index}`}
				required
				value={String(tax.amount)}
			/>
			<div>
				<Button
					aria-label="Remover imposto"
					className="row-start-2"
					onClick={onRemove}
					size="icon"
					variant="outline"
				>
					<LuTrash2 />
				</Button>
			</div>
		</FormFieldRow>
	);
}
