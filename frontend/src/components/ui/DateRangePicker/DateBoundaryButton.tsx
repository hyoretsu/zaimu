import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface DateBoundaryButtonProps {
	active: boolean;
	displayValue: string;
	label: string;
	onClick: () => void;
}

export function DateBoundaryButton({ active, displayValue, label, onClick }: DateBoundaryButtonProps) {
	return (
		<Button
			aria-pressed={active}
			className={cn(
				"h-auto min-w-0 cursor-pointer flex-col items-start gap-0 rounded-xl px-2 py-1.5 text-left text-xs",
				active && "border-primary ring-1 ring-primary",
			)}
			onClick={onClick}
			type="button"
			variant="outline"
		>
			<span className="text-muted-foreground">{label}</span>
			<span className="max-w-full truncate font-medium">{displayValue}</span>
		</Button>
	);
}
