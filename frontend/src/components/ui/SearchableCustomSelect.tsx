import { Search01Icon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useRef, useState } from "react";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import type { Option } from "./CustomSelect";
import { Input } from "./Input";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { ScrollArea } from "./ScrollArea";

export function SearchableCustomSelect({
	className,
	disabled,
	label,
	onValueChange,
	options,
	placeholder,
	required,
	value,
}: {
	className?: string;
	disabled?: boolean;
	label: string;
	onValueChange: (value: string) => void;
	options: Option[];
	placeholder: string;
	required?: boolean;
	value?: string;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useDebouncedInput("", () => undefined);
	const searchRef = useRef<HTMLInputElement>(null);
	const listId = useId();
	const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
	const filteredOptions = options.filter(option =>
		option.label.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
	);
	const selectedOption = options.find(option => option.value === value);
	const changeOpen = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setSearch("");
	};

	return (
		<div className={cn("grid gap-2", className)}>
			<p className="font-medium text-sm leading-none">
				{label} {required && <span className="text-destructive">*</span>}
			</p>
			<Popover onOpenChange={changeOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-controls={open ? listId : undefined}
						aria-expanded={open}
						aria-haspopup="listbox"
						aria-label={label}
						aria-required={required}
						className="h-10 w-full min-w-0 cursor-pointer justify-between gap-1.5 border-input font-normal disabled:cursor-not-allowed"
						disabled={disabled}
						role="combobox"
						type="button"
						variant="outline"
					>
						<span
							className={cn("min-w-0 flex-1 truncate text-left", !selectedOption && "text-muted-foreground")}
						>
							{selectedOption?.label ?? placeholder}
						</span>
						<HugeiconsIcon className="size-4 text-muted-foreground" icon={UnfoldMoreIcon} strokeWidth={2} />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="h-[16.75rem] w-(--radix-popover-trigger-width) min-w-36 gap-0 overflow-hidden p-0"
					onOpenAutoFocus={event => {
						event.preventDefault();
						searchRef.current?.focus({ preventScroll: true });
					}}
				>
					<div className="shrink-0 border-border/60 border-b bg-popover p-2">
						<div className="relative">
							<HugeiconsIcon
								aria-hidden="true"
								className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
								icon={Search01Icon}
								strokeWidth={2}
							/>
							<Input
								aria-controls={listId}
								aria-label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
								autoComplete="off"
								className="h-9 pl-9"
								name={`search-${label.toLocaleLowerCase("pt-BR")}`}
								onChange={event => setSearch(event.currentTarget.value)}
								onKeyDown={event => {
									if (event.key === "Enter") event.preventDefault();
									if (event.key === "ArrowDown") {
										event.preventDefault();
										document
											.getElementById(listId)
											?.querySelector<HTMLButtonElement>("button:not(:disabled)")
											?.focus();
									}
								}}
								placeholder={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
								ref={searchRef}
								type="text"
								value={search}
							/>
						</div>
					</div>
					<ScrollArea className="min-h-0 flex-1">
						<div
							aria-label={label}
							className="grid gap-1 p-1"
							id={listId}
							onKeyDown={event => {
								if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
								event.preventDefault();
								const buttons = Array.from(
									event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
								);
								const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
								if (event.key === "ArrowUp" && index === 0) {
									searchRef.current?.focus();
									return;
								}
								const nextIndex =
									event.key === "Home"
										? 0
										: event.key === "End"
											? buttons.length - 1
											: index + (event.key === "ArrowDown" ? 1 : -1);
								buttons[nextIndex]?.focus();
							}}
							role="listbox"
						>
							{filteredOptions.map(option => (
								<button
									aria-selected={option.value === value}
									className="relative flex w-full cursor-pointer items-center rounded-xl border border-transparent py-2 pr-8 pl-3 text-left text-sm outline-none hover:border-border hover:bg-accent focus-visible:border-ring focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
									disabled={option.disabled}
									key={option.value}
									onClick={() => {
										onValueChange(option.value);
										changeOpen(false);
									}}
									role="option"
									type="button"
								>
									{option.label}
									{option.value === value && (
										<HugeiconsIcon className="absolute right-2 size-4" icon={Tick02Icon} strokeWidth={2} />
									)}
								</button>
							))}
							{filteredOptions.length === 0 && (
								<p className="px-3 py-6 text-center text-muted-foreground text-sm">
									Nenhum resultado encontrado.
								</p>
							)}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	);
}
