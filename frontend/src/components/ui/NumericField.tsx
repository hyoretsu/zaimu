import { NumericFormat } from "react-number-format";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { Input } from "./Input";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";

export function NumericField({
	decimalScale = 4,
	disabled,
	description,
	hideLabel = false,
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
	hideLabel?: boolean;
	id: string;
	label: string;
	onValueChange: (value: string) => void;
	placeholder: string;
	required?: boolean;
	suffix?: string;
	value: string;
}) {
	const [local, setLocal] = useDebouncedInput(value, onValueChange);
	return (
		<div className="grid gap-2">
			<Label className={hideLabel ? "sr-only" : undefined} htmlFor={id}>
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
				onBlur={() => onValueChange(local)}
				onKeyDown={event => {
					if (event.key === "Enter") onValueChange(local);
				}}
				onValueChange={values => setLocal(values.value)}
				placeholder={placeholder}
				required={required}
				suffix={suffix}
				thousandSeparator="."
				value={local}
				valueIsNumericString
			/>
			{description && <p className="text-muted-foreground text-xs">{description}</p>}
		</div>
	);
}
