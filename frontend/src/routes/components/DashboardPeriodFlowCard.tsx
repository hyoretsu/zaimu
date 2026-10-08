import { LuArrowDownLeft, LuArrowUpRight } from "react-icons/lu";
import { Card } from "@/components/ui/Card";

interface DashboardPeriodFlowCardProps {
	currencyCode?: string;
	income: number;
	expenses: number;
	net: number;
	recurringIncome: number;
	recurringExpenses: number;
	isCurrentMonth?: boolean;
}

export function DashboardPeriodFlowCard({
	income,
	currencyCode = "BRL",
	expenses,
	net,
	recurringIncome,
	recurringExpenses,
	isCurrentMonth = false,
}: DashboardPeriodFlowCardProps) {
	const currency = new Intl.NumberFormat(navigator.languages, { currency: currencyCode, style: "currency" });
	return (
		<Card
			aria-label={isCurrentMonth ? "Fluxo do mês" : "Fluxo do período"}
			className="gap-0 py-0 xl:grid xl:grid-cols-3"
			role="group"
		>
			<div className="grid grid-cols-2 xl:col-span-2">
				<div className="min-w-0 bg-brand-yellow px-4 py-3 text-brand-ink sm:px-6 sm:py-4">
					<p className="flex items-center gap-1.5 text-xs sm:text-sm">
						<LuArrowDownLeft aria-hidden="true" className="size-4 shrink-0" /> Entradas
						{isCurrentMonth ? " do mês" : ""}
					</p>
					<p className="mt-2 break-words font-bold text-xl tracking-tight sm:text-2xl">
						{currency.format(income)}
					</p>
					<p className="mt-1 text-xs opacity-80">Recorrentes: {currency.format(recurringIncome)}</p>
				</div>
				<div className="min-w-0 px-4 py-3 sm:px-6 sm:py-4">
					<p className="flex items-center gap-1.5 text-muted-foreground text-xs sm:text-sm">
						<LuArrowUpRight aria-hidden="true" className="size-4 shrink-0" /> Saídas
						{isCurrentMonth ? " do mês" : ""}
					</p>
					<p className="mt-2 break-words font-bold text-xl tracking-tight sm:text-2xl">
						{currency.format(expenses)}
					</p>
					<p className="mt-1 text-xs opacity-80">Recorrentes: {currency.format(recurringExpenses)}</p>
				</div>
			</div>
			<div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs sm:px-6 xl:flex-col xl:items-start xl:justify-center xl:border-t-0 xl:border-l xl:py-4 xl:text-sm">
				<span className="text-muted-foreground">Resultado {isCurrentMonth ? "do mês" : "do período"}</span>
				<strong className={`text-right xl:text-xl ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
					{currency.format(net)}
				</strong>
			</div>
		</Card>
	);
}
