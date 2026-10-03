import { LuArrowDownLeft, LuArrowUpRight, LuCalendarClock } from "react-icons/lu";
import { Card } from "@/components/ui/Card";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

interface DashboardProjectedCashFlowCardProps {
	expenses: number;
	income: number;
	net: number;
	recurringIncome: number;
	recurringExpenses: number;
}

export function DashboardProjectedCashFlowCard({
	expenses,
	income,
	net,
	recurringIncome,
	recurringExpenses,
}: DashboardProjectedCashFlowCardProps) {
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
			resultLabel: "Ganho projetado",
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
			className={`gap-0 py-0 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(20rem,1.2fr)_minmax(12rem,0.85fr)] ${copy.cardClassName}`}
			role="group"
		>
			<div className="px-4 py-3 sm:px-6 sm:py-4">
				<p className="flex items-center gap-1.5 font-medium text-xs sm:gap-2 sm:text-sm">
					<LuCalendarClock aria-hidden="true" className="size-4 shrink-0" />
					Projeção até fim do mês
				</p>
				<p className="mt-1 text-muted-foreground text-xs">{copy.description}</p>
			</div>

			<div className="grid grid-cols-2 border-t xl:border-t-0 xl:border-l">
				<div className="min-w-0 px-3 py-3 sm:px-4 sm:py-4">
					<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<LuArrowDownLeft aria-hidden="true" className="size-4 shrink-0" /> Entradas previstas
					</p>
					<strong className="mt-1 block whitespace-nowrap text-base text-emerald-600 sm:text-lg">
						{currency.format(income)}
					</strong>
					<p className="mt-1 text-xs opacity-80">Recorrentes: {currency.format(recurringIncome)}</p>
				</div>
				<div className="min-w-0 border-l px-3 py-3 sm:px-4 sm:py-4">
					<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<LuArrowUpRight aria-hidden="true" className="size-4 shrink-0" /> Saídas previstas
					</p>
					<strong className="mt-1 block whitespace-nowrap text-base text-rose-600 sm:text-lg">
						{currency.format(expenses)}
					</strong>
					<p className="mt-1 text-xs opacity-80">Recorrentes: {currency.format(recurringExpenses)}</p>
				</div>
			</div>

			<div className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-6 xl:flex-col xl:items-start xl:justify-center xl:border-t-0 xl:border-l xl:py-4">
				<span className="text-muted-foreground text-xs">{copy.resultLabel}</span>
				<strong
					className={`whitespace-nowrap text-right text-xl tracking-tight sm:text-2xl ${copy.valueClassName}`}
				>
					{currency.format(Math.abs(net))}
				</strong>
			</div>
		</Card>
	);
}
