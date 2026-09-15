import { LuChevronDown, LuChevronUp, LuEyeOff } from "react-icons/lu";
import { Button } from "@/components/ui/Button";

export function HiddenTransactionsToggle({
	expanded,
	hiddenCount,
	onClick,
}: {
	expanded: boolean;
	hiddenCount: number;
	onClick: () => void;
}) {
	const countLabel = `${hiddenCount} ${hiddenCount === 1 ? "transação oculta" : "transações ocultas"}`;
	const actionLabel = expanded ? "Minimizar transações ocultas" : "Expandir transações ocultas";

	return (
		<Button
			aria-expanded={expanded}
			aria-label={actionLabel}
			className="w-full cursor-pointer justify-between text-muted-foreground hover:text-foreground"
			onClick={onClick}
			variant="outline"
		>
			<span className="flex min-w-0 items-center gap-2">
				<LuEyeOff aria-hidden="true" />
				{countLabel}
			</span>
			{expanded ? <LuChevronUp aria-hidden="true" /> : <LuChevronDown aria-hidden="true" />}
		</Button>
	);
}
