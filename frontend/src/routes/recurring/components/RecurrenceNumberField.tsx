import { NumericFormat } from "react-number-format";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
export function RecurrenceNumberField({
	name,
	label,
	value,
	onChange,
	placeholder,
}: {
	name: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
}) {
	const [local, setLocal] = useDebouncedInput(value, onChange);
	return (
		<div className="grid gap-2">
			<Label htmlFor={name}>
				<span>
					{label} <RequiredMark />
				</span>
			</Label>
			<NumericFormat
				allowNegative={false}
				customInput={Input}
				decimalScale={0}
				id={name}
				inputMode="numeric"
				name={name}
				onValueChange={values => setLocal(values.value)}
				placeholder={placeholder}
				required
				type="text"
				value={local}
			/>
		</div>
	);
}
