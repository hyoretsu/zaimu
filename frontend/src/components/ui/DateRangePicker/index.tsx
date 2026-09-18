import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { LuCalendarDays, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { CalendarMonth } from "./CalendarMonth";
import { DateBoundaryButton } from "./DateBoundaryButton";
import { formatDateRange } from "./date-range-label";
import { MonthYearPicker } from "./MonthYearPicker";
import { type DateRangeBoundary, selectDateRangeBoundary, selectDateRangePair } from "./range-selection";
import type { DateRangeValue } from "./types";

interface DateRangePickerProps {
	className?: string;
	onChange: (value: DateRangeValue) => void;
	triggerLabel?: string;
	value: DateRangeValue;
}

export function DateRangePicker({ className, onChange, triggerLabel, value }: DateRangePickerProps) {
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
	return (
		<Popover onOpenChange={handleOpenChange} open={open}>
			<PopoverTrigger asChild>
				<Button className={cn("min-w-60 cursor-pointer justify-start", className)} variant="outline">
					<LuCalendarDays />
					<span>{triggerLabel ?? formatDateRange(value)}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[20rem] gap-5 p-4"
				onOpenAutoFocus={event => event.preventDefault()}
			>
				<div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
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
					<DateBoundaryButton
						active={activeBoundary === "start"}
						displayValue={formatBoundary(draftRange.startDate)}
						label="De"
						onClick={() => {
							setActiveBoundary("start");
							setRangeStart(undefined);
						}}
					/>
					<DateBoundaryButton
						active={activeBoundary === "end"}
						displayValue={formatBoundary(draftRange.endDate)}
						label="Até"
						onClick={() => {
							setActiveBoundary("end");
							setRangeStart(undefined);
						}}
					/>
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
