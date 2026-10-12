import { currencyDigits } from "@zaimu/finance/money";
import { NumericFormat } from "react-number-format";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

export function BudgetAmountField({
	value,
	currency,
	disabled,
	onChange,
}: {
	value: number;
	currency: string;
	disabled: boolean;
	onChange: (value: number) => void;
}) {
	const [local, setLocal] = useDebouncedInput(value ? String(value) : "", next => onChange(Number(next)));
	const symbol =
		new Intl.NumberFormat("pt-BR", { currency, style: "currency" })
			.formatToParts(0)
			.find(part => part.type === "currency")?.value ?? currency;
	return (
		<div className="grid gap-2">
			<Label htmlFor="budget-amount">
				<span>
					Previsão mensal <RequiredMark />
				</span>
			</Label>
			<NumericFormat
				allowNegative={false}
				customInput={Input}
				decimalScale={currencyDigits(currency)}
				decimalSeparator=","
				disabled={disabled}
				id="budget-amount"
				inputMode="decimal"
				name="budget-amount"
				onBlur={() => onChange(Number(local))}
				onValueChange={values => setLocal(values.value)}
				placeholder={`${symbol} 8.500,00`}
				prefix={`${symbol} `}
				required
				thousandSeparator="."
				type="text"
				value={local}
				valueIsNumericString
			/>
			<input name="budget-amount-raw" type="hidden" value={local} />
		</div>
	);
}
