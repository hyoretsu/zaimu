import { format } from "date-fns";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import type { DateRangeValue } from "@/components/ui/DateRangePicker/types";

interface DashboardDateFilterProps {
	onChange: (value: DateRangeValue) => void;
	value: DateRangeValue;
}

export function DashboardDateFilter({ onChange, value }: DashboardDateFilterProps) {
	const today = format(new Date(), "yyyy-MM-dd");
	const isToday = value.startDate === today && value.endDate === today;
	return (
		<DateRangePicker
			onChange={nextValue => onChange(nextValue.startDate || nextValue.endDate ? nextValue : getTodayRange())}
			triggerLabel={isToday ? "Hoje" : undefined}
			value={value}
		/>
	);
}

function getTodayRange(): DateRangeValue {
	const today = format(new Date(), "yyyy-MM-dd");
	return { endDate: today, startDate: today };
}
