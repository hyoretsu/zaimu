import { assetSymbol } from "@zaimu/finance/asset-amount";
import { currencyDigits, isCryptoAsset } from "@zaimu/finance/money";
import { useEffect, useState } from "react";
import { NumericFormat } from "react-number-format";
import { Input } from "./Input";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";

export function AssetAmountField({
	assetCode,
	disabled,
	id,
	label,
	onValueChange,
	rawValueName,
	required,
	value,
}: {
	assetCode: string;
	disabled?: boolean;
	id: string;
	label: string;
	onValueChange: (value: string) => void;
	rawValueName?: string;
	required?: boolean;
	value: string;
}) {
	const fiat = !isCryptoAsset(assetCode);
	const symbol = assetSymbol(assetCode);
	const [local, setLocal] = useState(value);
	useEffect(() => setLocal(value), [value]);
	return (
		<div className="grid min-w-0 gap-2">
			<Label htmlFor={id}>
				<span>
					{label} {required && <RequiredMark />}
				</span>
			</Label>
			<NumericFormat
				customInput={Input}
				decimalScale={currencyDigits(assetCode)}
				decimalSeparator=","
				disabled={disabled}
				id={id}
				inputMode="decimal"
				name={id}
				onBlur={() => onValueChange(local)}
				onValueChange={(values, source) => {
					setLocal(values.value);
					if (source.source === "event") onValueChange(values.value);
				}}
				placeholder={`Ex: ${fiat ? `${symbol} ` : ""}${currencyDigits(assetCode) > 2 ? "0,00000001" : "150,00"}${fiat ? "" : ` ${symbol}`}`}
				required={required}
				prefix={fiat ? `${symbol} ` : undefined}
				suffix={fiat ? undefined : ` ${symbol}`}
				thousandSeparator="."
				value={local}
				valueIsNumericString
			/>
			<input id={`${id}-raw`} name={rawValueName} type="hidden" value={local} />
		</div>
	);
}
