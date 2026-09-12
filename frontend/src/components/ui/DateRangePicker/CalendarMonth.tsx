import {
	addDays,
	eachDayOfInterval,
	format,
	isAfter,
	isBefore,
	isSameDay,
	isSameMonth,
	max,
	min,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface CalendarMonthProps {
	activeBoundary: "end" | "start";
	endDate?: Date;
	hoveredDate?: Date;
	month: Date;
	onDateSelect: (date: Date) => void;
	onDateHover: (date: Date) => void;
	startDate?: Date;
}

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CalendarMonth({
	activeBoundary,
	endDate,
	hoveredDate,
	month,
	onDateHover,
	onDateSelect,
	startDate,
}: CalendarMonthProps) {
	const calendarStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
	const days = eachDayOfInterval({
		end: addDays(calendarStart, 41),
		start: calendarStart,
	});
	const previewStart =
		hoveredDate && (activeBoundary === "end" ? startDate : endDate)
			? min([hoveredDate, activeBoundary === "end" ? startDate! : endDate!])
			: undefined;
	const previewEnd =
		hoveredDate && (activeBoundary === "end" ? startDate : endDate)
			? max([hoveredDate, activeBoundary === "end" ? startDate! : endDate!])
			: undefined;

	return (
		<div className="space-y-3">
			<p className="text-center font-semibold text-sm capitalize">
				{format(month, "MMMM 'de' yyyy", { locale: ptBR })}
			</p>
			<div className="grid grid-cols-7 gap-1 text-center text-muted-foreground text-xs">
				{weekdays.map(weekday => (
					<span key={weekday}>{weekday}</span>
				))}
			</div>
			<div className="grid grid-cols-7 gap-1">
				{days.map(day => {
					const isRangeStart = Boolean(startDate && isSameDay(day, startDate));
					const isRangeEnd = Boolean(endDate && isSameDay(day, endDate));
					const isInRange = Boolean(
						startDate && endDate && isAfter(day, startDate) && isBefore(day, endDate),
					);
					const isPreview = Boolean(
						previewStart && previewEnd && isAfter(day, previewStart) && isBefore(day, previewEnd),
					);

					return (
						<Button
							aria-label={format(day, "PPP", { locale: ptBR })}
							className={cn(
								"h-8 rounded-lg border-border/60 p-0 text-xs",
								!isSameMonth(day, month) && "text-muted-foreground/45",
								isInRange && "border-primary/25 bg-primary/15 text-foreground hover:bg-primary/20",
								isPreview && "border-primary/30 bg-primary/20 text-foreground hover:bg-primary/25",
								(isRangeStart || isRangeEnd) &&
									"border-primary bg-primary text-primary-foreground hover:bg-primary/85",
							)}
							key={day.toISOString()}
							onClick={() => onDateSelect(day)}
							onMouseEnter={() => onDateHover(day)}
							size="icon-sm"
							type="button"
							variant="outline"
						>
							{format(day, "d")}
						</Button>
					);
				})}
			</div>
		</div>
	);
}
