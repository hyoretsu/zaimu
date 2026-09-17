import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { LuCalendarDays, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { CalendarMonth } from "./CalendarMonth";
import { formatDateRange } from "./date-range-label";
import { MonthYearPicker } from "./MonthYearPicker";
import { type DateRangeBoundary, selectDateRangeBoundary, selectDateRangePair } from "./range-selection";
import type { DateRangeValue } from "./types";

interface DateRangePickerProps {
	className?: string;
	description?: string;
	onChange: (value: DateRangeValue) => void;
	title?: string;
	triggerLabel?: string;
	value: DateRangeValue;
}

export function DateRangePicker({
	className,
	description = "Os limites são opcionais.",
	onChange,
	title = "Selecionar período",
	triggerLabel,
	value,
}: DateRangePickerProps) {
	const [open, setOpen] = useState(false);
	const [draftRange, setDraftRange] = useState(value);
	const [activeBoundary, setActiveBoundary] = useState<DateRangeBoundary>();
	const [hoveredDate, setHoveredDate] = useState<Date>();
	const [rangeStart, setRangeStart] = useState<string>();
	const [visibleMonth, setVisibleMonth] = useState(() => getVisibleMonth(value));
	const startDate = draftRange.startDate ? parseISO(draftRange.startDate) : undefined;
	const endDate = draftRange.endDate ? parseISO(draftRange.endDate) : undefined;

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			setDraftRange(value);
			setVisibleMonth(getVisibleMonth(value));
		}
		setActiveBoundary(undefined);
		setHoveredDate(undefined);
		setRangeStart(undefined);
		setOpen(nextOpen);
	};
	const handleDateSelect = (date: Date) => {
		const selectedDate = format(date, "yyyy-MM-dd");

		if (activeBoundary) {
			setDraftRange(currentRange => selectDateRangeBoundary(currentRange, activeBoundary, selectedDate));
			setActiveBoundary(undefined);
			return;
		}

		if (rangeStart) {
			setDraftRange(selectDateRangePair(rangeStart, selectedDate));
			setRangeStart(undefined);
			return;
		}

		setDraftRange({ startDate: selectedDate });
		setRangeStart(selectedDate);
	};
	const handleApply = () => {
		onChange(draftRange);
		setOpen(false);
	};
	const handleClear = () => {
		onChange({});
		setOpen(false);
	};
	const handleCurrentMonth = () => {
		const now = new Date();
		const currentMonth = {
			endDate: format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd"),
			startDate: format(startOfMonth(now), "yyyy-MM-dd"),
		};
		setDraftRange(currentMonth);
		setActiveBoundary(undefined);
		setRangeStart(undefined);
		setVisibleMonth(startOfMonth(now));
	};

	return (
		<Popover onOpenChange={handleOpenChange} open={open}>
			<PopoverTrigger asChild>
				<Button className={cn("min-w-60 cursor-pointer justify-start", className)} variant="outline">
					<LuCalendarDays />
					<span>{triggerLabel ?? formatDateRange(value)}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[22rem] gap-5 p-4">
				<PopoverHeader>
					<PopoverTitle>{title}</PopoverTitle>
					<PopoverDescription>{description}</PopoverDescription>
				</PopoverHeader>
				<div className="grid grid-cols-2 gap-2">
					<Button
						aria-pressed={activeBoundary === "start"}
						className={cn(
							"h-auto cursor-pointer flex-col items-start gap-0 rounded-xl px-3 py-2 text-left",
							activeBoundary === "start" && "border-primary ring-1 ring-primary",
						)}
						onClick={() => {
							setActiveBoundary("start");
							setRangeStart(undefined);
						}}
						type="button"
						variant="outline"
					>
						<span className="text-muted-foreground text-xs">De</span>
						<span>{formatBoundary(draftRange.startDate)}</span>
					</Button>
					<Button
						aria-pressed={activeBoundary === "end"}
						className={cn(
							"h-auto cursor-pointer flex-col items-start gap-0 rounded-xl px-3 py-2 text-left",
							activeBoundary === "end" && "border-primary ring-1 ring-primary",
						)}
						onClick={() => {
							setActiveBoundary("end");
							setRangeStart(undefined);
						}}
						type="button"
						variant="outline"
					>
						<span className="text-muted-foreground text-xs">Até</span>
						<span>{formatBoundary(draftRange.endDate)}</span>
					</Button>
				</div>
				<div className="flex items-center justify-between">
					<Tooltip>
						<TooltipTrigger asChild>
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
						</TooltipTrigger>
						<TooltipContent>Mês anterior</TooltipContent>
					</Tooltip>
					<Button
						className="cursor-pointer"
						onClick={handleCurrentMonth}
						size="sm"
						type="button"
						variant="outline"
					>
						Mês atual
					</Button>
					<Tooltip>
						<TooltipTrigger asChild>
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
						</TooltipTrigger>
						<TooltipContent>Próximo mês</TooltipContent>
					</Tooltip>
				</div>
				<MonthYearPicker month={visibleMonth} onMonthChange={setVisibleMonth} />
				<div onMouseLeave={() => setHoveredDate(undefined)}>
					<CalendarMonth
						activeBoundary={activeBoundary ?? "end"}
						endDate={endDate}
						hoveredDate={hoveredDate}
						month={visibleMonth}
						onDateHover={setHoveredDate}
						onDateSelect={handleDateSelect}
						startDate={startDate}
					/>
				</div>
				<div className="flex items-center justify-between gap-3 border-t pt-4">
					<Button className="cursor-pointer" onClick={handleClear} size="sm" type="button" variant="outline">
						Limpar
					</Button>
					<Button className="cursor-pointer" onClick={handleApply} size="sm" type="button">
						Aplicar
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function formatBoundary(value?: string) {
	return value ? format(parseISO(value), "dd MMM yyyy", { locale: ptBR }) : "Sem limite";
}

function getVisibleMonth({ endDate, startDate }: DateRangeValue) {
	return startOfMonth(parseISO(startDate ?? endDate ?? format(new Date(), "yyyy-MM-dd")));
}
