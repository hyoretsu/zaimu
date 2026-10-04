import type { ComponentProps } from "react";
import { LuClock, LuX } from "react-icons/lu";
import { showToast } from "@/stores";
import { Button } from "./Button";
import { FormField } from "./FormField";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";

type TimeFieldProps = Omit<ComponentProps<typeof FormField>, "onChange" | "type" | "value"> & {
	onValueChange: (value: string) => void;
	value: string;
};

export function TimeField({ onValueChange, value, disabled, className, onClick, ...props }: TimeFieldProps) {
	return (
		<FormField
			{...props}
			className={`relative pr-11 [@media(hover:none),_(pointer:coarse)]:cursor-pointer [@media(hover:hover)_and_(pointer:fine)]:[&::-webkit-calendar-picker-indicator]:hidden [@media(hover:none),_(pointer:coarse)]:[&::-webkit-calendar-picker-indicator]:absolute [@media(hover:none),_(pointer:coarse)]:[&::-webkit-calendar-picker-indicator]:inset-0 [@media(hover:none),_(pointer:coarse)]:[&::-webkit-calendar-picker-indicator]:h-full [@media(hover:none),_(pointer:coarse)]:[&::-webkit-calendar-picker-indicator]:w-full [@media(hover:none),_(pointer:coarse)]:[&::-webkit-calendar-picker-indicator]:opacity-0 ${className ?? ""}`}
			disabled={disabled}
			onChange={event => onValueChange(event.currentTarget.value)}
			onClick={event => {
				onClick?.(event);
				if (
					event.defaultPrevented ||
					disabled ||
					!window.matchMedia("(hover: none), (pointer: coarse)").matches
				)
					return;
				try {
					event.currentTarget.showPicker?.();
				} catch {
					// Keep native activation available in browsers that restrict showPicker.
				}
			}}
			trailing={
				<>
					<LuClock
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hidden"
					/>
					{value && !disabled ? (
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
					) : null}
				</>
			}
			type="time"
			value={value}
		/>
	);
}
