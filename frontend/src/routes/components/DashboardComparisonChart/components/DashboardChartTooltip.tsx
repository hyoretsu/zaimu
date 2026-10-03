import { format } from "date-fns";
import type { DashboardPeriod } from "@/lib/api";

const currency = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

interface DashboardChartTooltipProps {
	active?: boolean;
	period?: DashboardPeriod;
}

export function DashboardChartTooltip({ active, period }: DashboardChartTooltipProps) {
	if (!active || !period) return null;
	const start = new Date(`${period.startDate}T12:00:00`);
	const end = new Date(`${period.endDate}T12:00:00`);
	const fullMonth =
		start.getDate() === 1 &&
		start.getFullYear() === end.getFullYear() &&
		start.getMonth() === end.getMonth() &&
		end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
	const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(start);
	const label = fullMonth
		? `${month[0]?.toUpperCase()}${month.slice(1)}`
		: `${format(start, "dd/MM/yyyy")} até ${format(end, "dd/MM/yyyy")}`;
	const rows = [
		{ color: "text-sky-500", label: "Em conta", value: period.accountBalance },
		{ color: "text-amber-500", label: "Renda fixa", value: period.fixedIncomeBalance },
		{ color: "text-violet-500", label: "Renda variável", value: period.variableIncomeBalance },
		{ color: "text-primary", label: "Saldo total", total: true, value: period.endingBalance },
		{ color: "text-emerald-700", label: "Entradas recorrentes", value: period.recurringIncome },
		{ color: "text-emerald-500", label: "Outras entradas", value: period.income - period.recurringIncome },
		{ color: "text-emerald-500", label: "Entradas", total: true, value: period.income },
		{ color: "text-rose-700", label: "Saídas recorrentes", value: period.recurringExpenses },
		{ color: "text-rose-500", label: "Outras saídas", value: period.expenses - period.recurringExpenses },
		{ color: "text-rose-500", label: "Saídas", total: true, value: period.expenses },
	];
	return (
		<div className="grid w-64 max-w-[calc(100vw-4rem)] gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
			<p className="font-medium">{label}</p>
			{rows.map(row => (
				<div
					className={`flex items-center justify-between gap-3 ${row.total ? "border-t pt-1 font-semibold" : ""}`}
					key={row.label}
				>
					<span className="text-muted-foreground">{row.label}</span>
					<span className={`font-mono tabular-nums ${row.color}`}>{currency.format(row.value)}</span>
				</div>
			))}
		</div>
	);
}
