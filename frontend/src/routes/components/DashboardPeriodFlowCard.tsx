import { LuArrowDownLeft, LuArrowUpRight } from "react-icons/lu";
import { Card } from "@/components/ui/Card";
import { MoneyValue } from "@/components/ui/MoneyValue";
import { createCurrencyFormatter } from "@/lib/format-currency";

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
	const currency = createCurrencyFormatter(currencyCode, navigator.languages);
	return (
		<Card
			aria-label={isCurrentMonth ? "Fluxo do mês" : "Fluxo do período"}
			className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-0 py-0"
			role="group"
		>
			<div className="contents">
				<div className="min-w-0 bg-brand-yellow px-4 py-3 text-brand-ink sm:px-6 sm:py-4">
					<p className="flex items-center gap-1.5 text-xs sm:text-sm">
						<LuArrowDownLeft aria-hidden="true" className="size-4 shrink-0" /> Entradas
						{isCurrentMonth ? " do mês" : ""}
					</p>
					<MoneyValue className="mt-2">{currency.format(income)}</MoneyValue>
					<p className="mt-1 text-xs opacity-80">Recorrentes: {currency.format(recurringIncome)}</p>
				</div>
				<div className="min-w-0 border-t border-l px-4 py-3 sm:px-6 sm:py-4">
					<p className="flex items-center gap-1.5 text-muted-foreground text-xs sm:text-sm">
						<LuArrowUpRight aria-hidden="true" className="size-4 shrink-0" /> Saídas
						{isCurrentMonth ? " do mês" : ""}
					</p>
					<MoneyValue className="mt-2">{currency.format(expenses)}</MoneyValue>
					<p className="mt-1 text-xs opacity-80">Recorrentes: {currency.format(recurringExpenses)}</p>
				</div>
			</div>
			<div className="min-w-0 border-t border-l px-4 py-3 sm:px-6 sm:py-4">
				<p className="min-h-4 text-muted-foreground text-xs sm:text-sm">
					Resultado {isCurrentMonth ? "do mês" : "do período"}
				</p>
				<MoneyValue className={`mt-2 ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
					{currency.format(net)}
				</MoneyValue>
			</div>
		</Card>
	);
}
