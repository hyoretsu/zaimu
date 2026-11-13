import { type ComponentProps, useState } from "react";
import { LuClock, LuX } from "react-icons/lu";
import { caretAfterSlots, useMaskCaret } from "@/hooks/use-mask-caret";
import { useTwelveHourClock } from "@/hooks/use-twelve-hour-clock";
import { fixedMaskBeforeInput, fixedMaskKeyDown, fixedMaskPaste } from "@/lib/fixed-mask";
import {
	DIGIT_SLOT,
	type Draft12Hour,
	edit12Hour,
	edit24Hour,
	format12Hour,
	format24Hour,
	from12Hour,
	to12Hour,
	TWELVE_HOUR_SLOT,
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
 * Types into a mask that follows the time format setting (`hh:mm AM/PM` by default, or `HH:MM`), with the
 * guide characters always visible. The stored value is always 24-hour `HH:MM`.
 */
export function TimeField({ onValueChange, value, disabled, className, ...props }: TimeFieldProps) {
	const twelveHour = useTwelveHourClock();
	const [draft, setDraft] = useState<Draft12Hour | null>(null);
	const { ref, placeCaret } = useMaskCaret();

	// Keep the in-progress 12-hour draft only while it has not produced a different committed value.
	const committed = twelveHour ? to12Hour(value) : null;
	const current = draft && from12Hour(draft.digits, draft.period ?? "AM") === value ? draft : committed;

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
		) : (
			<LuClock
				aria-hidden
				className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
			/>
		);

	return (
		<FormField
			autoComplete="off"
			inputMode="numeric"
			onBeforeInput={fixedMaskBeforeInput}
			onKeyDown={fixedMaskKeyDown}
			onPaste={fixedMaskPaste}
			placeholder={twelveHour ? "hh:mm AM" : "HH:MM"}
			ref={ref}
			{...props}
			className={`pr-11 ${className ?? ""}`}
			disabled={disabled}
			onChange={event => {
				const { value: raw, selectionStart } = event.currentTarget;
				const caret = selectionStart ?? raw.length;
				if (!twelveHour) {
					const { next, caretSlots } = edit24Hour(raw, caret, value);
					placeCaret(caretAfterSlots(format24Hour(next), DIGIT_SLOT, caretSlots));
					onValueChange(next);
					return;
				}
				const previous = current ?? { digits: "", period: "AM" as const };
				const { next, caretSlots } = edit12Hour(raw, caret, previous);
				placeCaret(
					caretAfterSlots(format12Hour(next.digits, next.period), TWELVE_HOUR_SLOT, caretSlots),
				);
				setDraft(next);
				onValueChange(from12Hour(next.digits, next.period ?? "AM"));
			}}
			trailing={disabled ? null : clearButton}
			type="text"
			value={
				twelveHour
					? format12Hour(current?.digits ?? "", current ? current.period : "AM")
					: format24Hour(value)
			}
		/>
	);
}
