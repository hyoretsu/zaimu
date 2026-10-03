import { endOfMonth, format, startOfMonth } from "date-fns";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Label } from "@/components/ui/Label";
import { PeriodCountField } from "./PeriodCountField";
import type { ChartPeriodSettings } from "./types";

export function ChartPeriodFilter({
	onChange,
	value,
}: {
	onChange: (value: ChartPeriodSettings) => void;
	value: ChartPeriodSettings;
}) {
	return (
		<div className="flex flex-wrap items-start gap-3">
			<div className="grid w-64 max-w-full content-start gap-2">
				<Label>Período</Label>
				<DateRangePicker
					className="h-9 w-full min-w-0"
					onChange={range => {
						const today = new Date();
						const startDate = range.startDate ?? range.endDate ?? format(startOfMonth(today), "yyyy-MM-dd");
						const endDate = range.endDate ?? range.startDate ?? format(endOfMonth(today), "yyyy-MM-dd");
						onChange({ ...value, endDate, startDate });
					}}
					value={{ endDate: value.endDate, startDate: value.startDate }}
				/>
			</div>
			<PeriodCountField
				id="comparison-before"
				label="Períodos anteriores"
				max={60}
				min={0}
				onChange={periodsBefore => onChange({ ...value, periodsBefore })}
				value={value.periodsBefore}
			/>
			<PeriodCountField
				id="comparison-after"
				label="Períodos posteriores"
				max={60}
				min={0}
				onChange={periodsAfter => onChange({ ...value, periodsAfter })}
				value={value.periodsAfter}
			/>
		</div>
	);
}
