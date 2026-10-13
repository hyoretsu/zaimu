import { HiArrowDown, HiArrowPath, HiArrowUp } from "react-icons/hi2";
import { RecurrenceSummaryCard } from "./RecurrenceSummaryCard";
export function RecurringSummary({
	currencyCode,
	expenses,
	incomes,
	transfers = 0,
	period,
	values,
}: {
	currencyCode: string;
	expenses: number;
	incomes: number;
	transfers?: number;
	period?: string;
	values?: Array<{ amount: number; currency: string; direction: string }>;
}) {
	return (
		<div
			className={`grid gap-3 ${values?.some(value => value.direction === "TRANSFER") || transfers ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
		>
			<RecurrenceSummaryCard
				amount={incomes}
				color="bg-emerald-500/10 text-emerald-600"
				currencyCode={currencyCode}
				icon={HiArrowDown}
				label="Entradas agendadas"
				period={period}
				values={values?.filter(value => value.direction === "INCOME")}
			/>
			<RecurrenceSummaryCard
				amount={expenses}
				color="bg-rose-500/10 text-rose-600"
				currencyCode={currencyCode}
				icon={HiArrowUp}
				label="Saídas agendadas"
				period={period}
				values={values?.filter(value => value.direction === "EXPENSE")}
			/>
			{(values?.some(value => value.direction === "TRANSFER") || transfers > 0) && (
				<RecurrenceSummaryCard
					amount={transfers}
					color="bg-primary/10 text-primary"
					currencyCode={currencyCode}
					icon={HiArrowPath}
					label="Transferências próprias"
					period={period}
					values={values?.filter(value => value.direction === "TRANSFER")}
				/>
			)}
		</div>
	);
}
