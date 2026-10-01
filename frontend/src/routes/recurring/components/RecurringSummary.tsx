import { HiArrowDown, HiArrowPath, HiArrowUp } from "react-icons/hi2";
import { RecurrenceSummaryCard } from "./RecurrenceSummaryCard";
export function RecurringSummary({
	expenses,
	incomes,
	transfers = 0,
	period,
}: {
	expenses: number;
	incomes: number;
	transfers?: number;
	period?: string;
}) {
	return (
		<div className={`grid gap-3 ${transfers ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
			<RecurrenceSummaryCard
				amount={incomes}
				color="bg-emerald-500/10 text-emerald-600"
				icon={HiArrowDown}
				label="Entradas agendadas"
				period={period}
			/>
			<RecurrenceSummaryCard
				amount={expenses}
				color="bg-rose-500/10 text-rose-600"
				icon={HiArrowUp}
				label="Saídas agendadas"
				period={period}
			/>
			{transfers > 0 && (
				<RecurrenceSummaryCard
					amount={transfers}
					color="bg-primary/10 text-primary"
					icon={HiArrowPath}
					label="Transferências próprias"
					period={period}
				/>
			)}
		</div>
	);
}
