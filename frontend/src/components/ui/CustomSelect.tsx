import { cn } from "@/lib/utils";
import { SearchableCustomSelect } from "./SearchableCustomSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";

export interface Option {
	disabled?: boolean;
	label: string;
	special?: boolean;
	value: string;
}

export function CustomSelect({
	className,
	disabled,
	isLoading = false,
	error,
	onRetry,
	onOpenChange,
	label,
	onValueChange,
	options,
	placeholder,
	required,
	searchable = false,
	sortOptions = true,
	value,
}: {
	className?: string;
	disabled?: boolean;
	isLoading?: boolean;
	error?: string;
	onRetry?: () => void;
	onOpenChange?: (open: boolean) => void;
	label: string;
	onValueChange: (value: string) => void;
	options: Option[];
	placeholder: string;
	required?: boolean;
	searchable?: boolean;
	sortOptions?: boolean;
	value?: string;
}) {
	const displayedOptions = options.toSorted((left, right) => {
		if (left.special !== right.special) return left.special ? -1 : 1;
		return sortOptions ? left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" }) : 0;
	});

	if (searchable) {
		return (
			<SearchableCustomSelect
				className={className}
				disabled={disabled}
				error={error}
				isLoading={isLoading}
				label={label}
				onOpenChange={onOpenChange}
				onRetry={onRetry}
				onValueChange={onValueChange}
				options={displayedOptions}
				placeholder={placeholder}
				required={required}
				value={value}
			/>
		);
	}

	return (
		<div className={cn("grid gap-2", className)}>
			<p className="font-medium text-sm leading-none">
				{label} {required && <span className="text-destructive">*</span>}
			</p>
			<Select disabled={disabled} onOpenChange={onOpenChange} onValueChange={onValueChange} value={value}>
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
