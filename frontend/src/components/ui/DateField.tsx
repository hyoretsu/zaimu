import { addMonths, format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
import { useState } from "react";
import { LuChevronDown, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { ActionGroup } from "./ActionGroup";
import { CalendarMonth } from "./DateRangePicker/CalendarMonth";
import { MonthYearPicker } from "./DateRangePicker/MonthYearPicker";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";
import { ScrollArea } from "./ScrollArea";

interface DateFieldProps {
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
	const selectedDate = toDate(value);
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
			aria-required={required}
			className={cn(
				"h-9 w-full cursor-pointer justify-between rounded-4xl border-input bg-input/30 px-3 py-1 text-left font-normal text-sm hover:bg-input/50 disabled:cursor-not-allowed",
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
				startDate={selectedDate}
			/>
			<ActionGroup className="border-t pt-4">
				<Button
					className="cursor-pointer"
					disabled={!value}
					onClick={() => {
						onValueChange("");
						setOpen(false);
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					Limpar
				</Button>
				<Button className="cursor-pointer" onClick={() => selectDate(new Date())} size="sm" type="button">
					Selecionar
				</Button>
			</ActionGroup>
		</>
	);

	return (
		<div className="grid content-start gap-2">
			<Label htmlFor={id}>
				<span>
					{label} {required && <RequiredMark />}
				</span>
			</Label>
			<input autoComplete={autoComplete} name={name} readOnly type="hidden" value={value} />
			<Popover onOpenChange={handleOpenChange} open={open}>
				<PopoverTrigger asChild>{trigger}</PopoverTrigger>
				<PopoverContent align="start" className="w-[20rem] overflow-hidden p-0">
					<ScrollArea className="min-h-0 rounded-[inherit] [&>[data-slot=scroll-area-viewport]]:max-h-[min(calc(100dvh-2rem),var(--radix-popover-content-available-height))]">
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

function toDate(value: string) {
	if (!value) return undefined;
	const date = parseISO(value);
	return isValid(date) ? date : undefined;
}
