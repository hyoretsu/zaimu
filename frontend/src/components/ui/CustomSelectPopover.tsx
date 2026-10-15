import { Search01Icon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useRef, useState } from "react";
import { inputControlClassName } from "@/components/ui/input-styles";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import type { Option } from "./CustomSelect";
import { Input } from "./Input";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { ScrollArea } from "./ScrollArea";
import { Skeleton } from "./Skeleton";

export function CustomSelectPopover({
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
	searchable,
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
	searchable: boolean;
	value?: string;
	values?: string[];
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useDebouncedInput("", () => undefined);
	const searchRef = useRef<HTMLInputElement>(null);
	const typeahead = useRef({ text: "", time: 0 });
	const selectedRef = useRef<HTMLButtonElement>(null);
	const listId = useId();
	const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
	const filteredOptions = options.filter(
		option => option.special || option.label.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
	);
	const selectedOption = options.find(option =>
		values ? values.includes(option.value) : option.value === value,
	);
	const selectedLabel = values
		? options
				.filter(option => values.includes(option.value))
				.map(option => option.label)
				.join(", ")
		: selectedOption?.label;
	const changeOpen = (nextOpen: boolean) => {
		setOpen(nextOpen);
		onOpenChange?.(nextOpen);
		if (!nextOpen) setSearch("");
		typeahead.current = { text: "", time: 0 };
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
						className={`${inputControlClassName} cursor-pointer justify-between gap-1.5 disabled:cursor-not-allowed`}
						disabled={disabled}
						onKeyDown={event => {
							if (event.key === "ArrowDown" || event.key === "ArrowUp") {
								event.preventDefault();
								changeOpen(true);
							}
						}}
						role="combobox"
						type="button"
						variant="outline"
					>
						<span
							className={cn("min-w-0 flex-1 truncate text-left", !selectedLabel && "text-muted-foreground")}
						>
							{selectedLabel || placeholder}
						</span>
						<HugeiconsIcon className="size-4 text-muted-foreground" icon={UnfoldMoreIcon} strokeWidth={2} />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className={cn(
						"w-(--radix-popover-trigger-width) min-w-36 gap-0 overflow-hidden p-0",
						searchable ? "h-[16.75rem]" : "max-h-64",
					)}
					onOpenAutoFocus={event => {
						event.preventDefault();
						const selected = selectedRef.current?.disabled ? null : selectedRef.current;
						const target = searchable
							? searchRef.current
							: (selected ??
								document.getElementById(listId)?.querySelector<HTMLButtonElement>("button:not(:disabled)"));
						target?.focus({ preventScroll: true });
						const viewport = selected?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
						if (selected && viewport) {
							viewport.scrollTop +=
								selected.getBoundingClientRect().top -
								viewport.getBoundingClientRect().top -
								(viewport.clientHeight - selected.offsetHeight) / 2;
						}
					}}
				>
					{searchable && (
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
					)}
					<ScrollArea className="min-h-0 flex-1">
						<div
							aria-label={label}
							aria-multiselectable={values ? true : undefined}
							className="grid gap-1 p-1"
							id={listId}
							onKeyDown={event => {
								const buttons = Array.from(
									event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
								);
								if (
									!searchable &&
									event.key.length === 1 &&
									!event.ctrlKey &&
									!event.metaKey &&
									!event.altKey &&
									event.key !== " "
								) {
									event.preventDefault();
									const time = Date.now();
									const text =
										(time - typeahead.current.time < 700 ? typeahead.current.text : "") +
										event.key.toLocaleLowerCase("pt-BR");
									typeahead.current = { text, time };
									buttons
										.find(button => button.textContent?.trim().toLocaleLowerCase("pt-BR").startsWith(text))
										?.focus({ preventScroll: true });
									return;
								}
								if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
								event.preventDefault();
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
							{isLoading ? (
								<div aria-label="Carregando opções" className="space-y-2 p-2" role="status">
									{[0, 1, 2].map(key => (
										<Skeleton className="h-8 w-full" key={key} />
									))}
								</div>
							) : error ? (
								<div className="space-y-2 p-2">
									<p className="text-destructive text-sm" role="alert">
										{error}
									</p>
									<Button onClick={onRetry} variant="outline">
										Tentar novamente
									</Button>
								</div>
							) : (
								filteredOptions.map(option => (
									<button
										aria-selected={values ? values.includes(option.value) : option.value === value}
										className="relative flex w-full cursor-pointer items-center rounded-xl border border-transparent py-2 pr-8 pl-3 text-left text-sm outline-none hover:border-border hover:bg-accent focus-visible:border-ring focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
										disabled={option.disabled}
										key={option.value}
										onClick={() => {
											onValueChange(option.value);
											if (!values) changeOpen(false);
										}}
										ref={
											(values ? values.includes(option.value) : option.value === value)
												? selectedRef
												: undefined
										}
										role="option"
										type="button"
									>
										{option.label}
										{(values ? values.includes(option.value) : option.value === value) && (
											<HugeiconsIcon className="absolute right-2 size-4" icon={Tick02Icon} strokeWidth={2} />
										)}
									</button>
								))
							)}
							{!isLoading && !error && filteredOptions.length === 0 && (
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
