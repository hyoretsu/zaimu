import { format } from "date-fns";
import type { DashboardPeriod } from "@/lib/api";
import type { DashboardChartKind } from "./types";

const currency = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

interface DashboardChartTooltipProps {
	active?: boolean;
	kind?: DashboardChartKind;
	period?: DashboardPeriod;
}

export function DashboardChartTooltip({ active, kind, period }: DashboardChartTooltipProps) {
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
	const groups = [
		{
			color: "var(--color-primary)",
			label: "Patrimônio",
			rows: [
				{ color: "#0ea5e9", label: "Em conta", value: period.accountBalance },
				{
					color: "var(--color-foreground)",
					label: "Investido",
					subtotal: true,
					value: period.fixedIncomeBalance + period.variableIncomeBalance,
				},
				{ color: "#f59e0b", label: "Renda fixa", nested: true, value: period.fixedIncomeBalance },
				{ color: "#8b5cf6", label: "Renda variável", nested: true, value: period.variableIncomeBalance },
			],
			value: period.endingBalance,
		},
		{
			color: "#34d399",
			label: "Entradas",
			rows: [
				{ color: "#047857", label: "Renda", value: period.recurringIncome },
				{ color: "#34d399", label: "Outras entradas", value: period.income - period.recurringIncome },
			],
			value: period.income,
		},
		{
			color: "#fb7185",
			label: "Saídas",
			rows: [
				{
					color: "#be123c",
					label: "Gastos recorrentes",
					value: period.recurringExpenses - (period.recurringCardExpenses ?? 0),
				},
				{
					color: "#f97316",
					label: "Faturas",
					subtotal: true,
					value: period.cardExpenses ?? 0,
				},
				{ color: "#d946ef", label: "Assinaturas", nested: true, value: period.recurringCardExpenses ?? 0 },
				{
					color: "#f97316",
					label: "Outras compras",
					nested: true,
					value: (period.cardExpenses ?? 0) - (period.recurringCardExpenses ?? 0),
				},
				{
					color: "#fb7185",
					label: "Outras saídas",
					value:
						period.expenses -
						period.recurringExpenses -
						(period.cardExpenses ?? 0) +
						(period.recurringCardExpenses ?? 0),
				},
			],
			value: period.expenses,
		},
	];
	return (
		<div className="grid w-72 max-w-[calc(100vw-4rem)] gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
			<p className="font-medium">{label}</p>
			{groups
				.filter((_, index) => !kind || (kind === "balances" ? index === 0 : index > 0))
				.map(group => (
					<section
						aria-label={group.label}
						className="grid gap-1.5 border-border/60 border-t pt-2"
						key={group.label}
					>
						<div className="flex items-center justify-between gap-3 font-semibold">
							<span>{group.label}</span>
							<span className="font-mono tabular-nums" style={{ color: group.color }}>
								{currency.format(group.value)}
							</span>
						</div>
						{group.rows.map(row => (
							<div
								className={`flex items-center justify-between gap-3 ${"nested" in row ? "pl-6" : "pl-3"} ${"subtotal" in row ? "font-medium" : ""}`}
								key={row.label}
							>
								<span className="text-muted-foreground">{row.label}</span>
								<span className="font-mono tabular-nums" style={{ color: row.color }}>
									{currency.format(row.value)}
								</span>
							</div>
						))}
					</section>
				))}
		</div>
	);
}
