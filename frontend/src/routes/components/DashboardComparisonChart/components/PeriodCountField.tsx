import { NumericFormat } from "react-number-format";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

interface PeriodCountFieldProps {
	id: string;
	label: string;
	min: number;
	onChange: (value: number) => void;
	value: number;
}

export function PeriodCountField({ id, label, min, onChange, value }: PeriodCountFieldProps) {
	const [local, setLocal] = useDebouncedInput(String(value), next => {
		const parsed = Number(next);
		if (next && Number.isSafeInteger(parsed) && parsed >= min) onChange(parsed);
	});
	const valid = local !== "" && Number.isSafeInteger(Number(local)) && Number(local) >= min;
	return (
		<div className="grid w-max content-start gap-2">
			<Label htmlFor={id}>{label}</Label>
			<NumericFormat
				allowLeadingZeros={false}
				allowNegative={false}
				aria-describedby={!valid ? `${id}-error` : undefined}
				aria-invalid={!valid}
				className="w-0 min-w-full"
				customInput={Input}
				decimalScale={0}
				id={id}
				inputMode="numeric"
				name={id}
				onValueChange={({ value: next }) => setLocal(next)}
				placeholder={min === 0 ? "Ex: 3" : "Ex: 2"}
				type="text"
				value={local}
			/>
			{!valid && (
				<p className="text-destructive text-xs" id={`${id}-error`}>
					Informe um número inteiro maior ou igual a {min}.
				</p>
			)}
		</div>
	);
}
