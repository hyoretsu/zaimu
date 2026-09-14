import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";

interface Option {
	disabled?: boolean;
	label: string;
	value: string;
}

export function CustomSelect({
	className,
	disabled,
	label,
	onValueChange,
	options,
	placeholder,
	required,
	sortOptions = true,
	value,
}: {
	className?: string;
	disabled?: boolean;
	label: string;
	onValueChange: (value: string) => void;
	options: Option[];
	placeholder: string;
	required?: boolean;
	sortOptions?: boolean;
	value?: string;
}) {
	const displayedOptions = sortOptions
		? options.toSorted((left, right) =>
				left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" }),
			)
		: options;

	return (
		<div className={cn("grid gap-2", className)}>
			<p className="font-medium text-sm leading-none">
				{label} {required && <span className="text-destructive">*</span>}
			</p>
			<Select disabled={disabled} onValueChange={onValueChange} value={value}>
				<SelectTrigger aria-label={label} className="h-10 w-full cursor-pointer">
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{displayedOptions.map(option => (
						<SelectItem
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={option.disabled}
							key={option.value}
							value={option.value}
						>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
