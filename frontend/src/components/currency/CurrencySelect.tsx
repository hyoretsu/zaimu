import { CustomSelect } from "@/components/ui/CustomSelect";

const names = new Intl.DisplayNames(["pt-BR"], { type: "currency" });
const options = Intl.supportedValuesOf("currency").map(value => ({
	label: `${value} - ${names.of(value) ?? value}`,
	value,
}));

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
