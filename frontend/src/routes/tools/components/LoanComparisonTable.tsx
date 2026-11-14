import type { ComparisonResult, LoanComparison } from "@zaimu/finance/loan-comparison";
import { Badge } from "@/components/ui/Badge";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { cn } from "@/lib/utils";
import { formatComparisonDate, formatComparisonMoney, formatComparisonRate } from "./comparison-format";

interface Metric {
	label: string;
	value: (row: ComparisonResult) => number | string | null | undefined;
	format: "money" | "rate" | "count" | "date" | "boolean";
	/** Best value direction; omitted rows are informative only. */
	best?: "min" | "max";
}

const metrics: Metric[] = [
	{ best: "max", format: "money", label: "Valor recebido", value: row => row.received },
	{ format: "money", label: "Primeira parcela", value: row => row.firstInstallment },
	{ best: "min", format: "money", label: "Maior parcela", value: row => row.maxInstallment },
	{ format: "count", label: "Parcelas", value: row => row.installments },
	{ format: "date", label: "Último vencimento", value: row => row.lastDueDate },
	{ best: "min", format: "money", label: "Total pago", value: row => row.totalPaid },
	{ best: "min", format: "money", label: "Juros e encargos", value: row => row.totalCost },
	{ format: "rate", label: "Taxa mensal", value: row => row.monthlyRate },
	{ best: "min", format: "rate", label: "CET mensal", value: row => row.cetMonthly },
	{ best: "min", format: "rate", label: "CET anual", value: row => row.cetYearly },
	{ format: "money", label: "Valor presente das parcelas", value: row => row.presentValue },
	{ best: "min", format: "money", label: "Custo líquido a valor presente", value: row => row.netCost },
	{ format: "boolean", label: "Antecipação com desconto", value: row => (row.prepaymentDiscount ? 1 : 0) },
	{ format: "money", label: "Limite do cartão comprometido", value: row => row.limitCommitted },
];
const payoffMetrics: Metric[] = [
	{
		best: "min",
		format: "money",
		label: "Total com quitação antecipada",
		value: row => row.earlyPayoff?.total,
	},
	{ best: "max", format: "money", label: "Economia na quitação", value: row => row.earlyPayoff?.savings },
	{
		best: "min",
		format: "rate",
		label: "CET anual com quitação",
		value: row => row.earlyPayoff?.cetYearly,
	},
];

function bestValue(metric: Metric, rows: ComparisonResult[]) {
	if (!metric.best) return null;
	const values = rows
		.filter(row => row.status === "OK")
		.map(metric.value)
		.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
	if (values.length < 2) return null;
	return metric.best === "min" ? Math.min(...values) : Math.max(...values);
}

export function LoanComparisonTable({
	comparison,
	names,
	payoffMonth,
}: {
	comparison: LoanComparison;
	names: Record<string, string>;
	payoffMonth: number | null;
}) {
	const rows = comparison.results;
	const rank = (id: string) => comparison.ranking.indexOf(id);
	const shown = payoffMonth ? [...metrics, ...payoffMetrics] : metrics;
	const display = (metric: Metric, row: ComparisonResult) => {
		const value = metric.value(row);
		if (typeof value === "string") return formatComparisonDate(value);
		if (metric.format === "boolean") return value ? "Sim" : "Não";
		if (metric.format === "count") return value == null ? "-" : String(value);
		if (metric.format === "rate") return formatComparisonRate(value);
		return formatComparisonMoney(value, row.currency);
	};
	return (
		<ScrollArea className="rounded-xl border" horizontalScrollbar>
			<table className="w-full min-w-max text-sm">
				<thead>
					<tr className="bg-muted/40 border-b">
						<th className="bg-muted sticky left-0 z-10 p-3 text-left font-medium" scope="col">
							Indicador
						</th>
						{rows.map(row => (
							<th className="min-w-40 p-3 text-right font-medium" key={row.id} scope="col">
								<span className="block truncate">{names[row.id] || "Oferta"}</span>
								{row.status === "OK" ? (
									rank(row.id) >= 0 && (
										<Badge
											className="mt-1"
											variant={rank(row.id) === 0 ? "default" : "outline"}
										>
											{rank(row.id) + 1}º lugar
										</Badge>
									)
								) : (
									<Badge className="mt-1" variant="outline">
										{row.status === "MISSING_INDICATOR" ? "Sem indicador" : "Incompleta"}
									</Badge>
								)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{shown.map(metric => {
						const best = bestValue(metric, rows);
						return (
							<tr className="border-b last:border-0" key={metric.label}>
								<th
									className="bg-card text-muted-foreground sticky left-0 z-10 p-3 text-left font-normal"
									scope="row"
								>
									{metric.label}
								</th>
								{rows.map(row => {
									const value = metric.value(row);
									const isBest = row.status === "OK" && best != null && value === best;
									return (
										<td
											className={cn(
												"p-3 text-right tabular-nums",
												row.status !== "OK" && "text-muted-foreground",
												isBest && "text-success-600 font-semibold",
											)}
											key={row.id}
										>
											{row.status === "OK" ? display(metric, row) : "-"}
										</td>
									);
								})}
							</tr>
						);
					})}
				</tbody>
			</table>
		</ScrollArea>
	);
}
