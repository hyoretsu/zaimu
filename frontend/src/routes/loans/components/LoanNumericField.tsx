import { useState } from "react";
import { NumericFormat } from "react-number-format";
import { Input } from "@/components/ui/Input";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
export function LoanNumericField({
	name,
	label,
	money = false,
	percentage = false,
}: {
	name: string;
	label: string;
	money?: boolean;
	percentage?: boolean;
}) {
	const [value, setValue] = useState("");
	const [local, setLocal] = useDebouncedInput(value, setValue);
	return (
		<div className="grid gap-2">
			<label htmlFor={name}>
				{label} <RequiredMark />
			</label>
			<NumericFormat
				allowNegative={false}
				customInput={Input}
				decimalScale={money ? 2 : percentage ? 4 : 0}
				decimalSeparator=","
				id={name}
				inputMode={money || percentage ? "decimal" : "numeric"}
				name={name}
				onValueChange={values => setLocal(values.value)}
				placeholder={money ? "R$ 10.000,00" : percentage ? "1,50%" : "24"}
				prefix={money ? "R$ " : undefined}
				required
				suffix={percentage ? "%" : undefined}
				thousandSeparator="."
				type="text"
				value={local}
			/>
		</div>
	);
}
