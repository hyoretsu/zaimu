import { type ComponentProps, useMemo, useState } from "react";
import { LuX } from "react-icons/lu";
import { useMediaQuery } from "@/hooks/use-media-query";
import { fixedMaskBeforeInput, fixedMaskKeyDown, fixedMaskPaste } from "@/lib/fixed-mask";
import {
	type DayPeriod,
	format12Hour,
	format24Hour,
	from12Hour,
	mask24Hour,
	parse12Hour,
	to12Hour,
	usesTwelveHourClock,
} from "@/lib/time-mask";
import { showToast } from "@/stores";
import { Button } from "./Button";
import { FormField } from "./FormField";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";

type TimeFieldProps = Omit<ComponentProps<typeof FormField>, "onChange" | "type" | "value"> & {
	onValueChange: (value: string) => void;
	value: string;
};

/**
 * Touch devices open the native time picker (which follows the device's 12h/24h setting); the picker
 * indicator is hidden and stretched over the field. Pointer devices type into a mask that follows the
 * browser locale: `HH:MM` or `hh:mm AM/PM`, with the guide characters always visible. The stored value is always 24-hour `HH:MM`.
 */
export function TimeField({ onValueChange, value, disabled, className, ...props }: TimeFieldProps) {
	const isTouch = useMediaQuery("(hover: none), (pointer: coarse)");
	const twelveHour = useMemo(() => usesTwelveHourClock(), []);
	const [draft, setDraft] = useState<{ digits: string; period: DayPeriod } | null>(null);

	// Keep the in-progress 12-hour draft only while it has not produced a different committed value.
	const committed = twelveHour ? to12Hour(value) : null;
	const current = draft && from12Hour(draft.digits, draft.period) === value ? draft : committed;

	const clear = () => {
		setDraft(null);
		onValueChange("");
		showToast("Horário removido.", "info");
	};

	const clearButton =
		value || draft?.digits ? (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						aria-label="Limpar horário"
						className="absolute top-1/2 right-2 z-10 -translate-y-1/2 cursor-pointer"
						onClick={clear}
						onMouseDown={event => {
							// Avoid committing the native time editor on blur before the clear click.
							event.preventDefault();
						}}
						size="icon-xs"
						type="button"
						variant="outline"
					>
						<LuX />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Limpar horário</TooltipContent>
			</Tooltip>
		) : null;

	if (isTouch) {
		return (
			<FormField
				{...props}
				className={`pr-11 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 ${className ?? ""}`}
				disabled={disabled}
				onChange={event => onValueChange(event.currentTarget.value)}
				trailing={disabled ? null : clearButton}
				type="time"
				value={value}
			/>
		);
	}

	return (
		<FormField
			autoComplete="off"
			inputMode="numeric"
			onBeforeInput={fixedMaskBeforeInput}
			onKeyDown={fixedMaskKeyDown}
			onPaste={fixedMaskPaste}
			placeholder={twelveHour ? "hh:mm AM" : "HH:MM"}
			{...props}
			className={`pr-11 ${className ?? ""}`}
			disabled={disabled}
			onChange={event => {
				const raw = event.currentTarget.value;
				if (!twelveHour) {
					onValueChange(mask24Hour(raw, value, raw.length < format24Hour(value).length));
					return;
				}
				const previous = current ?? { digits: "", period: "AM" as DayPeriod };
				const deleting = raw.length < format12Hour(previous.digits, previous.period).length;
				const next = parse12Hour(raw, previous.period, previous.digits, deleting);
				setDraft(next);
				onValueChange(from12Hour(next.digits, next.period));
			}}
			trailing={disabled ? null : clearButton}
			type="text"
			value={
				twelveHour
					? format12Hour(current?.digits ?? "", current?.period ?? "AM")
					: format24Hour(value)
			}
		/>
	);
}
