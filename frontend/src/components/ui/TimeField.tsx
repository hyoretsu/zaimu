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

export function TimeField({ onValueChange, value, disabled, className, ...props }: TimeFieldProps) {
	return (
		<FormField
			{...props}
			className={`[@media(hover:hover)_and_(pointer:fine)]:[&::-webkit-calendar-picker-indicator]:hidden ${value ? "[@media(hover:hover)_and_(pointer:fine)]:pr-11" : ""} ${className ?? ""}`}
			disabled={disabled}
			onChange={event => onValueChange(event.currentTarget.value)}
			trailing={
				value && !disabled ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								aria-label="Limpar horário"
								className="absolute top-1/2 right-2 hidden -translate-y-1/2 cursor-pointer [@media(hover:hover)_and_(pointer:fine)]:inline-flex"
								onClick={() => {
									onValueChange("");
									showToast("Horário removido.", "info");
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
			type="time"
			value={value}
		/>
	);
}
