import { LuArrowDownLeft, LuArrowUpRight, LuCalendarClock } from "react-icons/lu";
import { Card } from "@/components/ui/Card";
import { MoneyValue } from "@/components/ui/MoneyValue";
import { createCurrencyFormatter } from "@/lib/format-currency";

interface DashboardProjectedCashFlowCardProps {
	expenses: number;
	currencyCode?: string;
	income: number;
	net: number;
}

export function DashboardProjectedCashFlowCard({
	expenses,
	income,
	currencyCode = "BRL",
	net,
}: DashboardProjectedCashFlowCardProps) {
	const currency = createCurrencyFormatter(currencyCode, navigator.languages);
	const projectionKind = net > 0 ? "gain" : net < 0 ? "expense" : "neutral";
	const copy = {
		expense: {
			cardClassName: "border-rose-500/30 bg-rose-500/5",
			description: "Saídas superam entradas a partir de amanhã.",
			resultLabel: "Gasto projetado",
			valueClassName: "text-rose-600",
		},
		gain: {
			cardClassName: "border-emerald-500/30 bg-emerald-500/5",
			description: "Entradas superam saídas a partir de amanhã.",
			resultLabel: "Saldo projetado",
			valueClassName: "text-emerald-600",
		},
		neutral: {
			cardClassName: "border-border bg-muted/30",
			description: "Entradas e saídas se equilibram a partir de amanhã.",
			resultLabel: "Fluxo projetado",
			valueClassName: "text-muted-foreground",
		},
	}[projectionKind];

	return (
		<Card
			aria-label="Fluxo projetado até fim do mês"
			className={`min-w-0 gap-0 py-0 ${copy.cardClassName}`}
			role="group"
		>
			<div className="px-4 py-3 sm:px-6 sm:py-4">
				<p className="flex items-center gap-1.5 font-medium text-xs sm:gap-2 sm:text-sm">
					<LuCalendarClock aria-hidden="true" className="size-4 shrink-0" />
					Projeção até fim do mês
				</p>
				<p className="mt-1 text-muted-foreground text-xs">{copy.description}</p>
			</div>

			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] border-t">
				<div className="min-w-0 border-l px-4 py-3 sm:px-6 sm:py-4">
					<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<LuArrowDownLeft aria-hidden="true" className="size-4 shrink-0" /> Entradas previstas
					</p>
					<MoneyValue className="mt-2 text-emerald-600">{currency.format(income)}</MoneyValue>
				</div>
				<div className="min-w-0 border-l px-4 py-3 sm:px-6 sm:py-4">
					<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<LuArrowUpRight aria-hidden="true" className="size-4 shrink-0" /> Saídas previstas
					</p>
					<MoneyValue className="mt-2 text-rose-600">{currency.format(expenses)}</MoneyValue>
				</div>
				<div className="min-w-0 border-l px-4 py-3 sm:px-6 sm:py-4">
					<p className="min-h-4 text-muted-foreground text-xs">{copy.resultLabel}</p>
					<MoneyValue className={`mt-2 ${copy.valueClassName}`}>{currency.format(Math.abs(net))}</MoneyValue>
				</div>
			</div>
		</Card>
	);
}
