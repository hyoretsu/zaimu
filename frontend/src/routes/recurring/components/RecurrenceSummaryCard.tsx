import type { IconType } from "react-icons";

export function RecurrenceSummaryCard({
	currencyCode,
	amount,
	label,
	period,
	icon: Icon,
	color,
}: {
	currencyCode: string;
	amount: number;
	label: string;
	period?: string;
	icon: IconType;
	color: string;
}) {
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	return (
		<div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
			<div className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${color}`}>
				<Icon />
			</div>
			<div className="min-w-0">
				<p className="text-muted-foreground text-xs">
					{label}
					{period ? ` - ${period}` : ""}
				</p>
				<p className="truncate font-bold text-lg">{currency.format(amount)}</p>
			</div>
		</div>
	);
}
