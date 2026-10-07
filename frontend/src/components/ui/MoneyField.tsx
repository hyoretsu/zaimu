import type { ChangeEvent, ComponentProps } from "react";
import { Input } from "./Input";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";

function centsToDecimal(value: string) {
	const isNegative = value.includes("-");
	const digits = value.replace(/\D/g, "");
	if (!digits) return "";

	const decimal = (Number(digits) / 100).toFixed(2);
	return isNegative && Number(decimal) > 0 ? `-${decimal}` : decimal;
}

export function MoneyField({
	id,
	currencyCode = "BRL",
	label,
	onValueChange,
	required,
	value,
	...props
}: Omit<ComponentProps<typeof Input>, "defaultValue" | "onChange" | "type" | "value"> & {
	currencyCode?: string;
	label: string;
	onValueChange: (value: string) => void;
	value: string;
}) {
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		onValueChange(centsToDecimal(event.currentTarget.value));
	};

	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>
				<span>
					{label} {required && <RequiredMark />}
				</span>
			</Label>
			<Input
				autoComplete="off"
				id={id}
				inputMode="numeric"
				name={id}
				onChange={handleChange}
				placeholder={currency.format(1500)}
				required={required}
				type="text"
				value={
					value === "" ? "" : currency.format(Number(value) < 0 ? Number(value) : Math.abs(Number(value)))
				}
				{...props}
			/>
		</div>
	);
}
