import { LuCalendarClock, LuChevronDown, LuChevronUp, LuEyeOff } from "react-icons/lu";
import { Button } from "@/components/ui/Button";

export function TransactionsGroupToggle({
	expanded,
	kind,
	onClick,
	entryCount,
}: {
	expanded: boolean;
	kind: "future" | "hidden";
	onClick: () => void;
	entryCount: number;
}) {
	const singularDescription = kind === "future" ? "movimentação futura" : "movimentação oculta";
	const pluralDescription = kind === "future" ? "movimentações futuras" : "movimentações ocultas";
	const countLabel = `${entryCount} ${entryCount === 1 ? singularDescription : pluralDescription}`;
	const actionLabel = `${expanded ? "Minimizar" : "Expandir"} ${pluralDescription}`;
	const Icon = kind === "future" ? LuCalendarClock : LuEyeOff;

	return (
		<Button
			aria-expanded={expanded}
			aria-label={actionLabel}
			className="w-full cursor-pointer justify-between text-muted-foreground hover:text-foreground"
			onClick={onClick}
			variant="outline"
		>
			<span className="flex min-w-0 items-center gap-2">
				<Icon aria-hidden="true" />
				{countLabel}
			</span>
			{expanded ? <LuChevronUp aria-hidden="true" /> : <LuChevronDown aria-hidden="true" />}
		</Button>
	);
}
