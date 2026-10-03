import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useState } from "react";
import {
	Bar,
	BarStack,
	CartesianGrid,
	ComposedChart,
	Line,
	ReferenceLine,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
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
const compactCurrency = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 2,
	notation: "compact",
	style: "currency",
});
const chartConfig = {
	accountBalance: { color: "#0ea5e9", label: "Em conta" },
	cardExpenses: { color: "#f97316", label: "Faturas" },
	endingBalance: { color: "var(--color-primary)", label: "Saldo total" },
	fixedIncomeBalance: { color: "#f59e0b", label: "Renda fixa" },
	otherExpenses: { color: "#fb7185", label: "Outras saídas" },
	otherIncome: { color: "#34d399", label: "Outras entradas" },
	recurringCardExpenses: { color: "#d946ef", label: "Assinaturas" },
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
	{ key: "cardExpenses", kind: "bar" },
	{ key: "recurringCardExpenses", kind: "bar" },
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
		cardExpenses: (item.cardExpenses ?? 0) - (item.recurringCardExpenses ?? 0),
		label: formatAxisLabel(item.startDate),
		otherExpenses:
			item.expenses - item.recurringExpenses - (item.cardExpenses ?? 0) + (item.recurringCardExpenses ?? 0),
		otherIncome: item.income - item.recurringIncome,
		recurringCardExpenses: item.recurringCardExpenses ?? 0,
		recurringExpenses: item.recurringExpenses - (item.recurringCardExpenses ?? 0),
		totalCardExpenses: item.cardExpenses ?? 0,
		totalRecurringExpenses: item.recurringExpenses,
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
						<div className="mb-2 flex justify-between gap-4 text-muted-foreground text-xs">
							<span>Patrimônio</span>
							<span className="text-right">Entradas e gastos</span>
						</div>
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
										yAxisId="balances"
									/>
								)}
								<XAxis dataKey="label" tickLine={false} />
								<YAxis
									orientation="left"
									tickFormatter={value => (mobile ? compactCurrency : currency).format(value)}
									width={mobile ? 72 : 110}
									yAxisId="balances"
								/>
								<YAxis
									orientation="right"
									tickFormatter={value => (mobile ? compactCurrency : currency).format(value)}
									width={mobile ? 72 : 110}
									yAxisId="flows"
								/>
								<Tooltip
									content={({ active, payload }) => (
										<DashboardChartTooltip
											active={active}
											period={
												payload?.[0]?.payload
													? {
															...payload[0].payload,
															cardExpenses: payload[0].payload.totalCardExpenses,
															recurringExpenses: payload[0].payload.totalRecurringExpenses,
														}
													: undefined
											}
										/>
									)}
									position={mobile ? { x: 0, y: 0 } : undefined}
								/>
								<BarStack radius={[4, 4, 0, 0]} stackId="income">
									<Bar
										dataKey="recurringIncome"
										fill="var(--color-recurringIncome)"
										stackId="income"
										yAxisId="flows"
									/>
									<Bar
										dataKey="otherIncome"
										fill="var(--color-otherIncome)"
										stackId="income"
										yAxisId="flows"
									/>
								</BarStack>
								<BarStack radius={[4, 4, 0, 0]} stackId="expenses">
									<Bar
										dataKey="recurringCardExpenses"
										fill="var(--color-recurringCardExpenses)"
										stackId="expenses"
										yAxisId="flows"
									/>
									<Bar
										dataKey="cardExpenses"
										fill="var(--color-cardExpenses)"
										stackId="expenses"
										yAxisId="flows"
									/>
									<Bar
										dataKey="recurringExpenses"
										fill="var(--color-recurringExpenses)"
										stackId="expenses"
										yAxisId="flows"
									/>
									<Bar
										dataKey="otherExpenses"
										fill="var(--color-otherExpenses)"
										stackId="expenses"
										yAxisId="flows"
									/>
								</BarStack>
								<Line
									dataKey="accountBalance"
									dot={false}
									stroke="var(--color-accountBalance)"
									strokeWidth={2}
									type="monotone"
									yAxisId="balances"
								/>
								<Line
									dataKey="endingBalance"
									dot={false}
									stroke="var(--color-endingBalance)"
									strokeWidth={3}
									type="monotone"
									yAxisId="balances"
								/>
								<Line
									dataKey="fixedIncomeBalance"
									dot={false}
									stroke="var(--color-fixedIncomeBalance)"
									strokeWidth={2}
									type="monotone"
									yAxisId="balances"
								/>
								<Line
									dataKey="variableIncomeBalance"
									dot={false}
									stroke="var(--color-variableIncomeBalance)"
									strokeWidth={2}
									type="monotone"
									yAxisId="balances"
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
