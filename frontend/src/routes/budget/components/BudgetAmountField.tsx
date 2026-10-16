import { MoneyField } from "@/components/ui/MoneyField";

export function BudgetAmountField({
	value,
	currency,
	disabled,
	required = true,
	onChange,
}: {
	value?: number | null;
	currency: string;
	disabled: boolean;
	required?: boolean;
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
			required={required}
			value={value ? String(value) : ""}
		/>
	);
}
