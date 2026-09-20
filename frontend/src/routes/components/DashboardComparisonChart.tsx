import { Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegendContent,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { Dashboard } from "@/lib/api";

const currency = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 0,
	style: "currency",
});
const chartConfig = {
	accountBalance: { color: "var(--color-sky-500)", label: "Em conta" },
	endingBalance: { color: "var(--color-primary)", label: "Saldo total" },
	expenses: { color: "var(--color-rose-500)", label: "Saídas" },
	income: { color: "var(--color-emerald-500)", label: "Entradas" },
	savingsBalance: { color: "var(--color-amber-500)", label: "Poupanças" },
} satisfies ChartConfig;
const tooltipValueColor = {
	accountBalance: "text-sky-500",
	endingBalance: "text-primary",
	expenses: "text-rose-500",
	income: "text-emerald-500",
	savingsBalance: "text-amber-500",
} as const;

function formatTooltipLabel(item: Dashboard["comparison"][number]) {
	const start = new Date(`${item.startDate}T12:00:00`);
	const end = new Date(`${item.endDate}T12:00:00`);
	const isFullMonth =
		start.getDate() === 1 &&
		start.getFullYear() === end.getFullYear() &&
		start.getMonth() === end.getMonth() &&
		end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
	if (isFullMonth) {
		const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(start);
		return `${label[0]?.toUpperCase()}${label.slice(1)}`;
	}
	return `${item.startDate} até ${item.endDate}`;
}

function formatAxisLabel(startDate: string) {
	const date = new Date(`${startDate}T12:00:00`);
	return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`;
}

export function DashboardComparisonChart({ comparison }: Pick<Dashboard, "comparison">) {
	const data = comparison.map(item => ({
		...item,
		label: formatAxisLabel(item.startDate),
	}));
	return (
		<Card>
			<CardHeader>
				<CardTitle>Evolução mensal</CardTitle>
				<p className="text-muted-foreground text-sm">
					Seis meses anteriores, período selecionado e seis seguintes.
				</p>
			</CardHeader>
			<CardContent>
				<ChartContainer className="h-72 w-full" config={chartConfig}>
					<ComposedChart data={data}>
						<CartesianGrid strokeDasharray="3 3" vertical={false} />
						<XAxis dataKey="label" tickLine={false} />
						<YAxis tickFormatter={value => currency.format(value)} width={76} />
						<Tooltip
							content={
								<ChartTooltipContent
									formatter={(value, name) => (
										<div className="flex w-full items-center justify-between gap-6">
											<span className="text-muted-foreground">
												{chartConfig[name as keyof typeof chartConfig]?.label ?? name}
											</span>
											<span
												className={`font-medium font-mono tabular-nums ${tooltipValueColor[name as keyof typeof tooltipValueColor] ?? "text-foreground"}`}
											>
												{currency.format(Number(value))}
											</span>
										</div>
									)}
									labelFormatter={(_, payload) => {
										const item = payload[0]?.payload as (typeof data)[number] | undefined;
										return item ? formatTooltipLabel(item) : "";
									}}
								/>
							}
						/>
						<Legend content={<ChartLegendContent />} />
						<Bar dataKey="income" fill="var(--color-income)" radius={4} />
						<Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} />
						<Line
							dataKey="accountBalance"
							dot={false}
							stroke="var(--color-accountBalance)"
							strokeWidth={2}
							type="monotone"
						/>
						<Line
							dataKey="endingBalance"
							dot={false}
							stroke="var(--color-endingBalance)"
							strokeWidth={3}
							type="monotone"
						/>
						<Line
							dataKey="savingsBalance"
							dot={false}
							stroke="var(--color-savingsBalance)"
							strokeWidth={2}
							type="monotone"
						/>
					</ComposedChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
