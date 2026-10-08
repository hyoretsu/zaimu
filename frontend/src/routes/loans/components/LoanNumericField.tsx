import { currencyDigits } from "@zaimu/finance/money";
import { useState } from "react";
import { NumericFormat } from "react-number-format";
import { Input } from "@/components/ui/Input";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
export function LoanNumericField({
	name,
	label,
	currencyCode = "BRL",
	money = false,
	percentage = false,
}: {
	name: string;
	label: string;
	currencyCode?: string;
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
				decimalScale={money ? currencyDigits(currencyCode) : percentage ? 4 : 0}
				decimalSeparator=","
				id={name}
				inputMode={money || percentage ? "decimal" : "numeric"}
				name={name}
				onValueChange={values => setLocal(values.value)}
				placeholder={
					money
						? new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" }).format(10000)
						: percentage
							? "1,50%"
							: "24"
				}
				prefix={money ? `${currencyCode} ` : undefined}
				required
				suffix={percentage ? "%" : undefined}
				thousandSeparator="."
				type="text"
				value={local}
			/>
		</div>
	);
}
