import { currencyDigits } from "@zaimu/finance/money";
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
				placeholder={`Ex: ${currencyDigits(assetCode) > 2 ? "0,00000001" : "150,00"} ${assetCode}`}
				required={required}
				suffix={` ${assetCode}`}
				thousandSeparator="."
				value={local}
				valueIsNumericString
			/>
			<input id={`${id}-raw`} name={rawValueName} type="hidden" value={local} />
		</div>
	);
}
