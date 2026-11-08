import type { ComponentProps } from "react";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

type DebouncedTextFieldProps = Omit<ComponentProps<typeof FormField>, "onChange" | "value"> & {
	onValueChange: (value: string) => void;
	value: string;
};

/** Text field with the shared 300 ms debounce; blurring flushes immediately so a quick submit never reads stale state. */
export function DebouncedTextField({ onValueChange, value, ...props }: DebouncedTextFieldProps) {
	const [local, setLocal] = useDebouncedInput(value, onValueChange);
	return (
		<FormField
			{...props}
			onBlur={() => onValueChange(local)}
			onChange={event => setLocal(event.currentTarget.value)}
			type="text"
			value={local}
		/>
	);
}
