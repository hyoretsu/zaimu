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
	return <DateRangePicker onChange={onChange} triggerLabel={isToday ? "Hoje" : undefined} value={value} />;
}
