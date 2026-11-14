import type { ComparisonResult } from "@zaimu/finance/loan-comparison";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatComparisonMoney } from "./comparison-format";

const colors = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#64748b"];

/** Cumulative amount paid per month, so faster and cheaper offers separate visually. */
export function LoanComparisonChart({
	names,
	results,
}: {
	names: Record<string, string>;
	results: ComparisonResult[];
}) {
	const rows = results.filter(row => row.status === "OK");
	const months = [...new Set(rows.flatMap(row => row.flows.map(flow => flow.date.slice(0, 7))))].sort();
	const data = months.map(month => {
		const point: Record<string, number | string> = { month };
		for (const row of rows)
			point[row.id] = row.flows
				.filter(flow => flow.date.slice(0, 7) <= month)
				.reduce((sum, flow) => sum + flow.amount, 0);
		return point;
	});
	const currency = rows[0]?.currency ?? "BRL";
	if (rows.length === 0) return null;
	return (
		<div
			aria-label="Total pago acumulado por mês em cada oferta"
			className="h-72 w-full min-w-0"
			role="img"
		>
			<ResponsiveContainer>
				<LineChart data={data}>
					<CartesianGrid strokeDasharray="3 3" />
					<XAxis dataKey="month" minTickGap={40} />
					<YAxis
						tickFormatter={value =>
							new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(Number(value))
						}
						width={75}
					/>
					<Tooltip formatter={value => formatComparisonMoney(Number(value), currency)} />
					<Legend />
					{rows.map((row, index) => (
						<Line
							dataKey={row.id}
							dot={false}
							key={row.id}
							name={names[row.id] || "Oferta"}
							stroke={colors[index % colors.length]}
							strokeWidth={2}
							type="stepAfter"
						/>
					))}
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
