import { useEffect, useRef, useState } from "react";
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
import { ChartContainer } from "@/components/ui/chart";
import { useMediaQuery } from "@/hooks/use-media-query";
import { chartConfig } from "./chart-config";
import { FloatingDashboardTooltip } from "./FloatingDashboardTooltip";
import type { DashboardChartKind, DashboardChartPeriod } from "./types";

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
const balanceKeys = [
	"accountBalance",
	"endingBalance",
	"fixedIncomeBalance",
	"variableIncomeBalance",
] as const;
const incomeKeys = ["recurringIncome", "otherIncome"] as const;
const expenseKeys = ["recurringCardExpenses", "cardExpenses", "recurringExpenses", "otherExpenses"] as const;
const flowKeys = [
	"recurringIncome",
	"otherIncome",
	"recurringExpenses",
	"otherExpenses",
	"cardExpenses",
	"recurringCardExpenses",
] as const;

interface DashboardPeriodChartProps {
	currentPeriod?: string;
	data: DashboardChartPeriod[];
	kind: DashboardChartKind;
}

export function DashboardPeriodChart({ currentPeriod, data, kind }: DashboardPeriodChartProps) {
	const chartRef = useRef<HTMLDivElement>(null);
	const [interacting, setInteracting] = useState(false);
	useEffect(() => {
		const dismissOutside = (event: PointerEvent) => {
			if (event.target instanceof Node && !chartRef.current?.contains(event.target)) {
				setInteracting(false);
			}
		};
		document.addEventListener("pointerdown", dismissOutside, true);
		return () => document.removeEventListener("pointerdown", dismissOutside, true);
	}, []);
	const mobile = useMediaQuery("(max-width: 639px)");
	const balances = kind === "balances";
	const title = balances ? "Patrimônio" : "Entradas e gastos";
	const keys = balances ? balanceKeys : flowKeys;
	const chartData = balances
		? data
		: data.map(period => ({
				...period,
				cardExpenses: (period.cardExpenses ?? 0) - (period.recurringCardExpenses ?? 0),
				otherExpenses:
					period.expenses -
					period.recurringExpenses -
					(period.cardExpenses ?? 0) +
					(period.recurringCardExpenses ?? 0),
				otherIncome: period.income - period.recurringIncome,
				recurringCardExpenses: period.recurringCardExpenses ?? 0,
				recurringExpenses: period.recurringExpenses - (period.recurringCardExpenses ?? 0),
			}));
	return (
		<section aria-label={title}>
			<h3 className="mb-3 font-medium text-sm">{title}</h3>
			<div
				onFocus={() => setInteracting(true)}
				onPointerDown={() => setInteracting(true)}
				onPointerMove={() => setInteracting(true)}
				ref={chartRef}
				style={{ touchAction: "none" }}
			>
				<ChartContainer className="h-64 w-full" config={chartConfig}>
					<ComposedChart data={chartData}>
						<CartesianGrid strokeDasharray="3 3" vertical={false} />
						<XAxis dataKey="label" scale="band" tickLine={false} />
						<YAxis
							tickFormatter={value => (mobile ? compactCurrency : currency).format(value)}
							width={mobile ? 72 : 110}
						/>
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
								x={currentPeriod}
							/>
						)}
						<Tooltip
							active={interacting}
							content={({ payload, coordinate }) => (
								<FloatingDashboardTooltip
									active={interacting}
									chartRef={chartRef}
									coordinate={coordinate}
									kind={kind}
									period={data.find(period => period.label === payload?.[0]?.payload?.label)}
								/>
							)}
						/>
						{balances ? (
							balanceKeys.map(key => (
								<Line
									dataKey={key}
									dot={false}
									key={key}
									stroke={`var(--color-${key})`}
									strokeWidth={key === "endingBalance" ? 3 : 2}
									type="monotone"
								/>
							))
						) : (
							<>
								<BarStack radius={[4, 4, 0, 0]} stackId="income">
									{incomeKeys.map(key => (
										<Bar dataKey={key} fill={`var(--color-${key})`} key={key} stackId="income" />
									))}
								</BarStack>
								<BarStack radius={[4, 4, 0, 0]} stackId="expenses">
									{expenseKeys.map(key => (
										<Bar dataKey={key} fill={`var(--color-${key})`} key={key} stackId="expenses" />
									))}
								</BarStack>
							</>
						)}
					</ComposedChart>
				</ChartContainer>
			</div>
			<ul
				aria-label={`Legenda de ${title.toLowerCase()}`}
				className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-muted-foreground text-xs"
			>
				{keys.map(key => (
					<li className="flex items-center gap-2 whitespace-nowrap" key={key}>
						<span
							aria-hidden="true"
							className={balances ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-[2px]"}
							style={{ backgroundColor: chartConfig[key].color }}
						/>
						{chartConfig[key].label}
					</li>
				))}
			</ul>
		</section>
	);
}
