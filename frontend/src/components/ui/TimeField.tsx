import type { ComponentProps } from "react";
import { LuX } from "react-icons/lu";
import { showToast } from "@/stores";
import { Button } from "./Button";
import { FormField } from "./FormField";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";

type TimeFieldProps = Omit<ComponentProps<typeof FormField>, "onChange" | "type" | "value"> & {
	onValueChange: (value: string) => void;
	value: string;
};

/** Masks free typing as `HH:MM`, clamping hours to 23 and minutes to 59. */
function maskTime(raw: string) {
	const digits = raw.replace(/\D/g, "").slice(0, 4);
	const hours = digits.length >= 2 && Number(digits.slice(0, 2)) > 23 ? "23" : digits.slice(0, 2);
	const minutes = digits.length === 4 && Number(digits.slice(2)) > 59 ? "59" : digits.slice(2);
	return minutes ? `${hours}:${minutes}` : hours;
}

export function TimeField({ onValueChange, value, disabled, className, ...props }: TimeFieldProps) {
	return (
		<FormField
			autoComplete="off"
			inputMode="numeric"
			maxLength={5}
			placeholder="HH:MM"
			{...props}
			className={`pr-11 ${className ?? ""}`}
			disabled={disabled}
			onChange={event => onValueChange(maskTime(event.currentTarget.value))}
			trailing={
				value && !disabled ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								aria-label="Limpar horário"
								className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
								onClick={() => {
									onValueChange("");
									showToast("Horário removido.", "info");
								}}
								onMouseDown={event => {
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
				) : null
			}
			type="text"
			value={value}
		/>
	);
}
