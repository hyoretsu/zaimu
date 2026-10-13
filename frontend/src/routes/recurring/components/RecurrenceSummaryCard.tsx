import type { IconType } from "react-icons";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";

export function RecurrenceSummaryCard({
	currencyCode,
	amount,
	values,
	label,
	period,
	icon: Icon,
	color,
}: {
	currencyCode: string;
	amount: number;
	values?: Array<{ amount: number; currency: string }>;
	label: string;
	period?: string;
	icon: IconType;
	color: string;
}) {
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
				<p className="truncate font-bold text-lg">
					<PreferredMoneyAmount values={values ?? [{ amount, currency: currencyCode }]} />
				</p>
			</div>
		</div>
	);
}
