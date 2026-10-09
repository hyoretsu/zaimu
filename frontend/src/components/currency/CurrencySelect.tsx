import { CustomSelect } from "@/components/ui/CustomSelect";
import { useCurrencyStore } from "@/stores/currency";

export function CurrencySelect({
	value,
	onValueChange,
	label = "Moeda",
	disabled = false,
}: {
	value: string;
	onValueChange: (value: string) => void;
	label?: string;
	disabled?: boolean;
}) {
	const currencies = useCurrencyStore(state => state.currencies);
	const names = new Intl.DisplayNames(document.documentElement.lang || "pt-BR", { type: "currency" });
	const options = currencies.map(value => ({ label: `${value} - ${names.of(value) ?? value}`, value }));
	return (
		<CustomSelect
			disabled={disabled}
			label={label}
			onValueChange={onValueChange}
			options={options}
			placeholder="Ex: USD - Dólar americano"
			required
			searchable
			value={value}
		/>
	);
}
