import type { HistoryCoverage } from "./types";
export function HistoryCoverageTotals({ data }: { data: HistoryCoverage }) {
	const totals = [
		{ label: "Taxas de juros no banco", value: data.totals.interestRecords },
		{ label: "Snapshots cambiais no banco", value: data.totals.currencySnapshots },
		{ label: "Dias por série no período", value: data.requestedDays },
	];
	return (
		<div className="grid gap-3 sm:grid-cols-3">
			{totals.map(total => (
				<div className="rounded-xl border p-3" key={total.label}>
					<p className="text-muted-foreground text-sm">{total.label}</p>
					<strong className="text-xl">{total.value.toLocaleString("pt-BR")}</strong>
				</div>
			))}
		</div>
	);
}
