import { formatAsset, unitsToDecimal } from "@zaimu/finance/asset-amount";
import { currencyDigits, currencyScale, isCryptoAsset } from "@zaimu/finance/money";
import type { ChangeEvent, ComponentProps } from "react";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { Input } from "./Input";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";

function centsToDecimal(value: string, currency: string) {
	const isNegative = value.includes("-");
	const crypto = isCryptoAsset(currency);
	const digits = (crypto ? value.replace(currency.toUpperCase(), "") : value).replace(/\D/g, "");
	if (!digits) return "";

	if (crypto) {
		const exact = unitsToDecimal(BigInt(digits), currency);
		return isNegative && /[1-9]/.test(exact) ? `-${exact}` : exact;
	}
	const decimal = (Number(digits) / currencyScale(currency)).toFixed(currencyDigits(currency));
	return isNegative && Number(decimal) > 0 ? `-${decimal}` : decimal;
}

export function MoneyField({
	className,
	disabled,
	id,
	currencyCode = "BRL",
	label,
	onValueChange,
	onBlur,
	rawValueName,
	required,
	value,
	...props
}: Omit<ComponentProps<typeof Input>, "defaultValue" | "onChange" | "type" | "value"> & {
	currencyCode?: string;
	rawValueName?: string;
	label: string;
	onValueChange: (value: string) => void;
	value: string;
}) {
	const [localValue, setLocalValue] = useDebouncedInput(value, onValueChange);
	const hasCurrency = currencyCode.trim() !== "";
	const crypto = hasCurrency && isCryptoAsset(currencyCode);
	const intl = new Intl.NumberFormat(
		"pt-BR",
		hasCurrency && !crypto ? { currency: currencyCode, style: "currency" } : { style: "decimal" },
	);
	const formatValue = (value: string) =>
		crypto
			? formatAsset(value, currencyCode, { locale: "pt-BR", trim: false })
			: intl.format(Number(value) < 0 ? Number(value) : Math.abs(Number(value)));
	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		if (hasCurrency) setLocalValue(centsToDecimal(event.currentTarget.value, currencyCode));
	};

	return (
		<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" data-slot="money-field">
			<Label htmlFor={id}>
				<span>
					{label} {required && <RequiredMark />}
				</span>
			</Label>
			<Input
				autoComplete="off"
				className={className}
				disabled={disabled || !hasCurrency}
				id={id}
				inputMode="numeric"
				name={id}
				onBlur={event => {
					onValueChange(localValue);
					onBlur?.(event);
				}}
				onChange={handleChange}
				placeholder={hasCurrency ? formatValue("1500") : "Selecione uma moeda"}
				required={required}
				type="text"
				value={localValue === "" ? "" : formatValue(localValue)}
				{...props}
			/>
			{rawValueName && <input name={rawValueName} type="hidden" value={localValue} />}
		</div>
	);
}
