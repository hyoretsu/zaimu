import type { PlannerResult } from "@zaimu/finance/loan-planner";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "./loan-format";
export function LoanPlannerChart({
	baseline,
	result,
	currency,
}: {
	baseline: PlannerResult;
	result: PlannerResult;
	currency: string;
}) {
	const data = result.months.map((row, index) => ({
		baseline: baseline.months[index]?.balance,
		minimum: row.minimumBalance,
		month: row.month,
		scenario: row.balance,
	}));
	return (
		<div
			aria-label="Comparação mensal de saldo: manter cronograma, cenário e menor saldo diário"
			className="h-72 w-full min-w-0"
			role="img"
		>
			<ResponsiveContainer>
				<LineChart data={data}>
					<CartesianGrid strokeDasharray="3 3" />
					<XAxis dataKey="month" minTickGap={40} />
					<YAxis
						tickFormatter={v =>
							new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(Number(v))
						}
						width={75}
					/>
					<Tooltip formatter={v => formatCurrency(Number(v), currency)} />
					<Legend />
					<Line dataKey="baseline" dot={false} name="Manter cronograma" stroke="#64748b" />
					<Line dataKey="scenario" dot={false} name="Cenário" stroke="#2563eb" />
					<Line dataKey="minimum" dot={false} name="Menor saldo diário" stroke="#dc2626" />
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
