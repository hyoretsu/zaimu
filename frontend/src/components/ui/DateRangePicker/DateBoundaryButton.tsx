import { LuX } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

interface DateBoundaryButtonProps {
	active: boolean;
	displayValue: string;
	label: string;
	onClick: () => void;
	onClear?: () => void;
}

export function DateBoundaryButton({
	active,
	displayValue,
	label,
	onClick,
	onClear,
}: DateBoundaryButtonProps) {
	return (
		<div className="relative min-w-0">
			<Button
				aria-pressed={active}
				className={cn(
					"h-auto w-full min-w-0 cursor-pointer flex-col items-start gap-0 rounded-xl px-2 py-1.5 text-left text-xs",
					active && "border-primary ring-primary ring-1",
					onClear && "pr-10",
				)}
				onClick={onClick}
				type="button"
				variant="outline"
			>
				<span className="text-muted-foreground">{label}</span>
				<span className="max-w-full truncate font-medium">{displayValue}</span>
			</Button>
			{onClear && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={`Limpar ${label}`}
							className="absolute top-1/2 right-2 size-6 -translate-y-1/2 cursor-pointer"
							onClick={onClear}
							size="icon-xs"
							type="button"
							variant="outline"
						>
							<LuX className="size-3" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{`Limpar ${label}`}</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
