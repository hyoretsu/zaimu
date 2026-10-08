import { currencyDigits, currencyScale } from "@zaimu/finance/money";
import type { ChangeEvent, ComponentProps } from "react";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { Input } from "./Input";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";

function centsToDecimal(value: string, currency: string) {
	const isNegative = value.includes("-");
	const digits = value.replace(/\D/g, "");
	if (!digits) return "";

	const decimal = (Number(digits) / currencyScale(currency)).toFixed(currencyDigits(currency));
	return isNegative && Number(decimal) > 0 ? `-${decimal}` : decimal;
}

export function MoneyField({
	id,
	currencyCode = "BRL",
	label,
	onValueChange,
	onBlur,
	required,
	value,
	...props
}: Omit<ComponentProps<typeof Input>, "defaultValue" | "onChange" | "type" | "value"> & {
	currencyCode?: string;
	label: string;
	onValueChange: (value: string) => void;
	value: string;
}) {
	const [localValue, setLocalValue] = useDebouncedInput(value, onValueChange);
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		setLocalValue(centsToDecimal(event.currentTarget.value, currencyCode));
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
				onBlur={event => {
					onValueChange(localValue);
					onBlur?.(event);
				}}
				onChange={handleChange}
				placeholder={currency.format(1500)}
				required={required}
				type="text"
				value={
					localValue === ""
						? ""
						: currency.format(Number(localValue) < 0 ? Number(localValue) : Math.abs(Number(localValue)))
				}
				{...props}
			/>
		</div>
	);
}
