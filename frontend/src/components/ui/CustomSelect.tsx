import { useEffect } from "react";
import { CustomSelectPopover } from "./CustomSelectPopover";

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
	values,
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
	values?: string[];
}) {
	const enabledOptions = options.filter(option => !option.disabled);
	const singleOptionValue = enabledOptions.length === 1 ? enabledOptions[0]!.value : undefined;
	const hasValidSelection = enabledOptions.some(option => option.value === value);

	useEffect(() => {
		if (disabled || isLoading || error || values !== undefined || hasValidSelection) return;
		if (singleOptionValue !== undefined) onValueChange(singleOptionValue);
	}, [disabled, error, hasValidSelection, isLoading, onValueChange, singleOptionValue, values]);

	const displayedOptions = options.toSorted((left, right) => {
		if (left.special !== right.special) return left.special ? -1 : 1;
		return sortOptions ? left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" }) : 0;
	});

	// Keep the list open when dismissing the mobile keyboard resizes the viewport.
	return (
		<CustomSelectPopover
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
			searchable={searchable || Boolean(values)}
			value={value}
			values={values}
		/>
	);
}
