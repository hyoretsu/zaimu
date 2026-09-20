import { NumericFormat } from "react-number-format";
import { Input } from "./Input";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";

export function NumericField({
	decimalScale = 4,
	disabled,
	description,
	id,
	label,
	onValueChange,
	placeholder,
	required,
	suffix,
	value,
}: {
	decimalScale?: number;
	disabled?: boolean;
	description?: string;
	id: string;
	label: string;
	onValueChange: (value: string) => void;
	placeholder: string;
	required?: boolean;
	suffix?: string;
	value: string;
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>
				<span>
					{label} {required && <RequiredMark />}
				</span>
			</Label>
			<NumericFormat
				allowNegative={false}
				autoComplete="off"
				customInput={Input}
				decimalScale={decimalScale}
				decimalSeparator=","
				disabled={disabled}
				id={id}
				name={id}
				onValueChange={values => onValueChange(values.value)}
				placeholder={placeholder}
				required={required}
				suffix={suffix}
				thousandSeparator="."
				value={value}
				valueIsNumericString
			/>
			{description && <p className="text-muted-foreground text-xs">{description}</p>}
		</div>
	);
}
