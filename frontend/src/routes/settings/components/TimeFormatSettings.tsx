import { CustomSelect } from "@/components/ui/CustomSelect";
import { showToast } from "@/stores";
import { type TimeFormat, useTimeFormatStore } from "@/stores/time-format";

const options: { label: string; value: TimeFormat }[] = [
	{ label: "12 horas (AM/PM)", value: "12h" },
	{ label: "24 horas", value: "24h" },
];

export function TimeFormatSettings() {
	const { setTimeFormat, timeFormat } = useTimeFormatStore();
	return (
		<section className="card space-y-3 p-4">
			<CustomSelect
				label="Formato de horário"
				onValueChange={value => {
					setTimeFormat(value as TimeFormat);
					showToast("Formato de horário atualizado", "positive");
				}}
				options={options}
				placeholder="Ex: 12 horas (AM/PM)"
				value={timeFormat}
			/>
			<p className="text-muted-foreground text-sm">
				Define como os horários são digitados: 02:30 PM ou 14:30.
			</p>
		</section>
	);
}
