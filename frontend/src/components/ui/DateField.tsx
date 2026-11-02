import { addMonths, format, isValid, parse, parseISO, startOfMonth, subMonths } from "date-fns";
import { useLayoutEffect, useRef, useState } from "react";
import { LuCalendarDays, LuChevronDown, LuChevronLeft, LuChevronRight, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { inputControlClassName } from "@/components/ui/input-styles";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { showToast } from "@/stores";
import { CalendarMonth } from "./DateRangePicker/CalendarMonth";
import { MonthYearPicker } from "./DateRangePicker/MonthYearPicker";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";
import { ScrollArea } from "./ScrollArea";

interface DateFieldProps {
	selectionAction?: { label: string; value: string; toastMessage: string };
	autoComplete?: string;
	className?: string;
	description?: string;
	disabled?: boolean;
	error?: string;
	id: string;
	label: string;
	max?: string;
	min?: string;
	name: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	required?: boolean;
	value: string;
}

export function DateField({
	selectionAction,
	autoComplete,
	className,
	description,
	disabled,
	error,
	id,
	label,
	max,
	min,
	name,
	onValueChange,
	placeholder = "Ex: 23/08/2026",
	required,
	value,
}: DateFieldProps) {
	const [open, setOpen] = useState(false);
	const isTouch = useMediaQuery("(hover: none), (pointer: coarse)");
	const [draft, setDraft] = useState<{ source: string; text: string }>();
	const inputRef = useRef<HTMLInputElement>(null);
	const pendingCaret = useRef<number | undefined>(undefined);
	useLayoutEffect(() => {
		if (pendingCaret.current === undefined) return;
		inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
		pendingCaret.current = undefined;
	});
	const selectedDate = toDate(value);
	const displayValue =
		draft?.source === value ? draft.text : selectedDate ? format(selectedDate, "dd/MM/yyyy") : "";
	const commitDraft = () => {
		if (!draft || draft.source !== value) return;
		const text = draft.text.trim();
		const date = parse(text, "dd/MM/yyyy", new Date());
		if (!text) onValueChange("");
		else if (isValid(date) && format(date, "dd/MM/yyyy") === text) {
			const nextValue = format(date, "yyyy-MM-dd");
			if ((!min || nextValue >= min) && (!max || nextValue <= max)) onValueChange(nextValue);
		}
		setDraft(undefined);
	};
	const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
	const hasDescription = Boolean(description || error);

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setVisibleMonth(startOfMonth(selectedDate ?? new Date()));
		setOpen(nextOpen);
	};
	const selectDate = (date: Date) => {
		const nextValue = format(date, "yyyy-MM-dd");
		if ((min && nextValue < min) || (max && nextValue > max)) return;
		onValueChange(nextValue);
		setOpen(false);
	};
	const trigger = (
		<Button
			aria-describedby={hasDescription ? `${id}-description` : undefined}
			aria-invalid={Boolean(error)}
			aria-labelledby={`${id}-label`}
			aria-required={required}
			className={cn(
				inputControlClassName,
				"hover:bg-input/50 cursor-pointer justify-between text-left disabled:cursor-not-allowed",
				!selectedDate && "text-muted-foreground",
				className,
			)}
			disabled={disabled}
			id={id}
			type="button"
			variant="outline"
		>
			<span>{selectedDate ? format(selectedDate, "dd/MM/yyyy") : placeholder}</span>
			<LuChevronDown className="size-4 shrink-0" />
		</Button>
	);
	const calendar = (
		<>
			<div className="flex items-center justify-between">
				<Button
					aria-label="Mês anterior"
					className="cursor-pointer"
					onClick={() => setVisibleMonth(month => subMonths(month, 1))}
					size="icon-sm"
					type="button"
					variant="outline"
				>
					<LuChevronLeft />
				</Button>
				<Button
					className="cursor-pointer"
					onClick={() => setVisibleMonth(startOfMonth(new Date()))}
					size="sm"
					type="button"
					variant="outline"
				>
					Hoje
				</Button>
				<Button
					aria-label="Próximo mês"
					className="cursor-pointer"
					onClick={() => setVisibleMonth(month => addMonths(month, 1))}
					size="icon-sm"
					type="button"
					variant="outline"
				>
					<LuChevronRight />
				</Button>
			</div>
			<MonthYearPicker month={visibleMonth} onMonthChange={setVisibleMonth} />
			<CalendarMonth
				activeBoundary="start"
				month={visibleMonth}
				onDateHover={() => undefined}
				onDateSelect={selectDate}
				onMonthChange={setVisibleMonth}
				startDate={selectedDate}
			/>
			<ActionGroup>
				{selectionAction && (
					<Button
						className="cursor-pointer"
						disabled={disabled || !toDate(selectionAction.value)}
						onClick={() => {
							const date = toDate(selectionAction.value);
							if (!date) return;
							const nextValue = format(date, "yyyy-MM-dd");
							if ((min && nextValue < min) || (max && nextValue > max)) return;
							selectDate(date);
							showToast(selectionAction.toastMessage, "info");
						}}
						size="sm"
						type="button"
						variant="outline"
					>
						<LuCalendarDays />
						{selectionAction.label}
					</Button>
				)}
				<Button
					className="cursor-pointer"
					disabled={disabled || !value}
					onClick={() => {
						onValueChange("");
						setOpen(false);
						showToast("Seleção de data limpa.", "info");
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					<LuX />
					Limpar seleção
				</Button>
			</ActionGroup>
		</>
	);

	return (
		<div className="grid content-start gap-2">
			<Label asChild id={`${id}-label`}>
				<span>
					{label} {required && <RequiredMark />}
				</span>
			</Label>
			<input autoComplete={autoComplete} name={name} readOnly type="hidden" value={value} />
			<Popover onOpenChange={handleOpenChange} open={open}>
				{isTouch ? (
					<PopoverTrigger asChild>{trigger}</PopoverTrigger>
				) : (
					<div className="relative">
						<input
							aria-describedby={hasDescription ? `${id}-description` : undefined}
							aria-invalid={Boolean(error)}
							aria-labelledby={`${id}-label`}
							aria-required={required}
							autoComplete={autoComplete}
							className={cn(inputControlClassName, "w-full pr-12", className)}
							disabled={disabled}
							id={id}
							inputMode="numeric"
							onBlur={commitDraft}
							onChange={event => {
								const input = event.target;
								const digitsBeforeCaret = input.value
									.slice(0, input.selectionStart ?? 0)
									.replace(/\D/g, "").length;
								const text = maskDate(input.value);
								pendingCaret.current = dateCaret(text, digitsBeforeCaret);
								setDraft({ source: value, text });
							}}
							onKeyDown={event => {
								const input = event.currentTarget;
								const start = input.selectionStart ?? 0;
								const end = input.selectionEnd ?? start;
								const backward = event.key === "Backspace";
								if (start === end && (backward || event.key === "Delete")) {
									const digits = displayValue.replace(/\D/g, "");
									const before = displayValue.slice(0, start).replace(/\D/g, "").length;
									const index = backward ? before - 1 : before;
									event.preventDefault();
									if (index >= 0 && index < digits.length) {
										const text = maskDate(
											digits.slice(0, index) + digits.slice(index + 1),
										);
										pendingCaret.current = dateCaret(text, index);
										setDraft({ source: value, text });
									}
								}
								if (event.key === "Enter") {
									event.preventDefault();
									commitDraft();
								}
							}}
							placeholder={placeholder}
							ref={inputRef}
							type="text"
							value={displayValue}
						/>
						<PopoverTrigger asChild>
							<Button
								aria-label={label}
								className="absolute inset-y-0 right-0 w-11"
								disabled={disabled}
								size="icon"
								type="button"
								variant="ghost"
							>
								<LuCalendarDays className="size-4" />
							</Button>
						</PopoverTrigger>
					</div>
				)}
				<PopoverContent align="start" className="w-[20rem] overflow-hidden p-0">
					<ScrollArea className="min-h-0 rounded-[inherit] [&>[data-slot=scroll-area-viewport]]:max-h-[min(var(--popup-viewport-height),var(--popover-side-height))]">
						<div className="flex flex-col gap-4 p-4">{calendar}</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
			{hasDescription && (
				<p
					className={error ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
					id={`${id}-description`}
				>
					{error || description}
				</p>
			)}
		</div>
	);
}

function maskDate(value: string) {
	const digits = value.replace(/\D/g, "").slice(0, 8);
	return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

function dateCaret(text: string, digitCount: number) {
	let position = 0;
	let digits = 0;
	while (position < text.length && digits < digitCount) {
		if (/\d/.test(text[position])) digits++;
		position++;
	}
	if (text[position] === "/") position++;
	return position;
}

function toDate(value: string) {
	if (!value) return undefined;
	const date = parseISO(value);
	return isValid(date) ? date : undefined;
}
