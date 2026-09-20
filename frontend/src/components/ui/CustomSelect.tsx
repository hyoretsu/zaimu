import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { cn } from "@/lib/utils";
import { Input } from "./Input";
import { ScrollArea } from "./ScrollArea";
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
	searchable = false,
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
	searchable?: boolean;
	sortOptions?: boolean;
	value?: string;
}) {
	const displayedOptions = sortOptions
		? options.toSorted((left, right) =>
				left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" }),
			)
		: options;
	const [search, setSearch] = useDebouncedInput("", () => undefined);
	const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
	const filteredOptions = normalizedSearch
		? displayedOptions.filter(option => option.label.toLocaleLowerCase("pt-BR").includes(normalizedSearch))
		: displayedOptions;

	return (
		<div className={cn("grid gap-2", className)}>
			<p className="font-medium text-sm leading-none">
				{label} {required && <span className="text-destructive">*</span>}
			</p>
			<Select
				disabled={disabled}
				onOpenChange={open => {
					if (!open) setSearch("");
				}}
				onValueChange={onValueChange}
				value={value}
			>
				<SelectTrigger aria-label={label} className="h-10 w-full cursor-pointer">
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent
					className={searchable ? "flex h-[16.75rem] flex-col" : undefined}
					header={
						searchable ? (
							<div className="border-border/60 border-b bg-popover p-2">
								<div className="relative">
									<HugeiconsIcon
										aria-hidden="true"
										className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
										icon={Search01Icon}
										strokeWidth={2}
									/>
									<Input
										autoComplete="off"
										autoFocus
										className="h-9 pl-9"
										name={`search-${label.toLocaleLowerCase("pt-BR")}`}
										onChange={event => setSearch(event.currentTarget.value)}
										onKeyDown={event => {
											if (event.key !== "Escape") event.stopPropagation();
										}}
										placeholder={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
										type="text"
										value={search}
									/>
								</div>
							</div>
						) : undefined
					}
					position={searchable ? "popper" : "item-aligned"}
					scrollButtons={!searchable}
					viewportClassName={searchable ? "min-h-0 flex-1 overflow-hidden" : undefined}
				>
					{searchable ? (
						<ScrollArea className="h-full">
							<div className="grid gap-1 p-1">
								{filteredOptions.map(option => (
									<SelectItem
										className="cursor-pointer disabled:cursor-not-allowed"
										disabled={option.disabled}
										key={option.value}
										value={option.value}
									>
										{option.label}
									</SelectItem>
								))}
								{filteredOptions.length === 0 && (
									<p className="px-3 py-6 text-center text-muted-foreground text-sm">
										Nenhum resultado encontrado.
									</p>
								)}
							</div>
						</ScrollArea>
					) : (
						displayedOptions.map(option => (
							<SelectItem
								className="cursor-pointer disabled:cursor-not-allowed"
								disabled={option.disabled}
								key={option.value}
								value={option.value}
							>
								{option.label}
							</SelectItem>
						))
					)}
				</SelectContent>
			</Select>
		</div>
	);
}
