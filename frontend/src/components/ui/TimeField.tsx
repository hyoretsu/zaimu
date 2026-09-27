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
		<div className="relative">
			<FormField
				{...props}
				className={`${value ? "[@media(hover:hover)_and_(pointer:fine)]:pr-11" : ""} ${className ?? ""}`}
				disabled={disabled}
				onChange={event => onValueChange(event.currentTarget.value)}
				type="time"
				value={value}
			/>
			{value && !disabled ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Limpar horário"
							className="absolute right-2 bottom-1.5 hidden cursor-pointer [@media(hover:hover)_and_(pointer:fine)]:inline-flex"
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
		</div>
	);
}
