import { MoneyField } from "@/components/ui/MoneyField";

export function BudgetAmountField({
	value,
	currency,
	disabled,
	onChange,
}: {
	value: number;
	currency: string;
	disabled: boolean;
	onChange: (value: number) => void;
}) {
	return (
		<MoneyField
			currencyCode={currency}
			disabled={disabled}
			id="budget-amount"
			label="Previsão mensal"
			onValueChange={value => onChange(Number(value))}
			rawValueName="budget-amount-raw"
			required
			value={value ? String(value) : ""}
		/>
	);
}
