import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { ChartPeriodFilter, type ChartPeriodSettings } from "./components";
import { DashboardChartTooltip } from "./components/DashboardChartTooltip";

const currency = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});
const chartConfig = {
	accountBalance: { color: "#0ea5e9", label: "Em conta" },
	endingBalance: { color: "var(--color-primary)", label: "Saldo total" },
	fixedIncomeBalance: { color: "#f59e0b", label: "Renda fixa" },
	otherExpenses: { color: "#fb7185", label: "Outras saídas" },
	otherIncome: { color: "#34d399", label: "Outras entradas" },
	recurringExpenses: { color: "#be123c", label: "Gastos recorrentes" },
	recurringIncome: { color: "#047857", label: "Renda" },
	variableIncomeBalance: { color: "#8b5cf6", label: "Renda variável" },
} satisfies ChartConfig;
const legendItems = [
	{ key: "accountBalance", kind: "line" },
	{ key: "endingBalance", kind: "line" },
	{ key: "fixedIncomeBalance", kind: "line" },
	{ key: "variableIncomeBalance", kind: "line" },
	{ key: "recurringIncome", kind: "bar" },
	{ key: "otherIncome", kind: "bar" },
	{ key: "recurringExpenses", kind: "bar" },
	{ key: "otherExpenses", kind: "bar" },
] as const;

function formatAxisLabel(startDate: string) {
	const date = new Date(`${startDate}T12:00:00`);
	return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`;
}

export function DashboardComparisonChart() {
	const identity = useCacheIdentity();
	const mobile = useMediaQuery("(max-width: 639px)");
	const [settings, setSettings] = useState<ChartPeriodSettings>(() => ({
		endDate: format(endOfMonth(new Date()), "yyyy-MM-dd"),
		periodsAfter: 10,
		periodsBefore: 1,
		startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
	}));

	const query = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.dashboard.getComparison(settings),
		queryKey: queryKeys.dashboard.comparison(identity!, settings),
	});
	const today = format(new Date(), "yyyy-MM-dd");
	const data = (query.data ?? []).map(item => ({
		...item,
		label: formatAxisLabel(item.startDate),
		otherExpenses: item.expenses - item.recurringExpenses,
		otherIncome: item.income - item.recurringIncome,
	}));
	const currentPeriod = data.find(item => item.startDate <= today && today <= item.endDate);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Evolução por período</CardTitle>
				<p className="text-muted-foreground text-sm">
					{settings.periodsBefore + 1 + settings.periodsAfter} períodos: {settings.periodsBefore} anteriores,
					período de referência e {settings.periodsAfter} posteriores.
				</p>
				<ChartPeriodFilter onChange={setSettings} value={settings} />
			</CardHeader>
			<CardContent>
				{query.isPending ? (
					<div aria-label="Carregando evolução por período" className="space-y-4" role="status">
						<Skeleton className="h-72 w-full" />
						<Skeleton className="mx-auto h-4 w-64 max-w-full" />
					</div>
				) : query.isError ? (
					<p className="py-12 text-center text-muted-foreground">
						Não foi possível carregar o gráfico. Selecione o período novamente para tentar.
					</p>
				) : (
					<>
						<ChartContainer className="h-72 w-full" config={chartConfig}>
							<ComposedChart data={data}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								{currentPeriod && (
									<ReferenceLine
										label={{
											fill: "var(--color-foreground)",
											fontSize: 11,
											position: "insideTopRight",
											value: "Período atual",
										}}
										stroke="var(--color-foreground)"
										strokeDasharray="4 4"
										strokeOpacity={0.6}
										x={currentPeriod.label}
									/>
								)}
								<XAxis dataKey="label" tickLine={false} />
								<YAxis tickFormatter={value => currency.format(value)} width={110} />
								<Tooltip
									content={({ active, payload }) => (
										<DashboardChartTooltip active={active} period={payload?.[0]?.payload} />
									)}
									position={mobile ? { x: 0, y: 0 } : undefined}
								/>
								<Bar dataKey="recurringIncome" fill="var(--color-recurringIncome)" stackId="income" />
								<Bar
									dataKey="otherIncome"
									fill="var(--color-otherIncome)"
									radius={[4, 4, 0, 0]}
									stackId="income"
								/>
								<Bar dataKey="recurringExpenses" fill="var(--color-recurringExpenses)" stackId="expenses" />
								<Bar
									dataKey="otherExpenses"
									fill="var(--color-otherExpenses)"
									radius={[4, 4, 0, 0]}
									stackId="expenses"
								/>
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
									dataKey="fixedIncomeBalance"
									dot={false}
									stroke="var(--color-fixedIncomeBalance)"
									strokeWidth={2}
									type="monotone"
								/>
								<Line
									dataKey="variableIncomeBalance"
									dot={false}
									stroke="var(--color-variableIncomeBalance)"
									strokeWidth={2}
									type="monotone"
								/>
							</ComposedChart>
						</ChartContainer>
						<ul
							aria-label="Legenda do gráfico"
							className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-muted-foreground text-xs"
						>
							{legendItems.map(({ key, kind }) => (
								<li className="flex items-center gap-2 whitespace-nowrap" key={key}>
									<span
										aria-hidden="true"
										className={kind === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-[2px]"}
										style={{ backgroundColor: chartConfig[key].color }}
									/>
									{chartConfig[key].label}
								</li>
							))}
						</ul>
					</>
				)}
			</CardContent>
		</Card>
	);
}
