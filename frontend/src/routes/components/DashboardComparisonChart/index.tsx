import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { type ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DashboardPeriod } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { ChartPeriodFilter, type ChartPeriodSettings } from "./components";

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
const legendItems = [
	{ key: "accountBalance", kind: "line" },
	{ key: "endingBalance", kind: "line" },
	{ key: "savingsBalance", kind: "line" },
	{ key: "income", kind: "bar" },
	{ key: "expenses", kind: "bar" },
] as const;

function formatTooltipLabel(item: DashboardPeriod) {
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
	return `${format(start, "dd/MM/yyyy")} até ${format(end, "dd/MM/yyyy")}`;
}

function formatAxisLabel(startDate: string) {
	const date = new Date(`${startDate}T12:00:00`);
	return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`;
}

export function DashboardComparisonChart() {
	const identity = useCacheIdentity();
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
