import { LuCalendarClock, LuChevronDown, LuChevronUp, LuEyeOff, LuTrendingUp } from "react-icons/lu";
import { Button } from "@/components/ui/Button";

export function TransactionsGroupToggle({
	expanded,
	kind,
	onClick,
	entryCount,
	totals,
}: {
	expanded: boolean;
	kind: "future" | "hidden" | "yield";
	onClick: () => void;
	entryCount: number;
	totals?: { currency: string; amount: number }[];
}) {
	const singularDescription =
		kind === "yield" ? "rendimento" : kind === "future" ? "movimentação futura" : "movimentação oculta";
	const pluralDescription =
		kind === "yield" ? "rendimentos" : kind === "future" ? "movimentações futuras" : "movimentações ocultas";
	const countLabel = `${entryCount} ${entryCount === 1 ? singularDescription : pluralDescription}`;
	const actionLabel = `${expanded ? "Minimizar" : "Expandir"} ${pluralDescription}`;
	const Icon = kind === "yield" ? LuTrendingUp : kind === "future" ? LuCalendarClock : LuEyeOff;

	return (
		<Button
			aria-expanded={expanded}
			aria-label={actionLabel}
			className="h-auto min-h-9 w-full cursor-pointer justify-between whitespace-normal text-muted-foreground hover:text-foreground"
			onClick={onClick}
			variant="outline"
		>
			<span className="flex min-w-0 items-center gap-2">
				<Icon aria-hidden="true" />
				{countLabel}
			</span>
			<span className="flex min-w-0 items-center gap-2">
				{totals && (
					<span className="flex flex-wrap justify-end gap-x-2 text-emerald-600 dark:text-emerald-400">
						{totals.map(({ currency, amount }) => (
							<span className="tabular-nums" key={currency}>
								{amount > 0 ? "+" : ""}
								{new Intl.NumberFormat("pt-BR", { currency, style: "currency" }).format(amount)}
							</span>
						))}
					</span>
				)}
				{expanded ? <LuChevronUp aria-hidden="true" /> : <LuChevronDown aria-hidden="true" />}
			</span>
		</Button>
	);
}
