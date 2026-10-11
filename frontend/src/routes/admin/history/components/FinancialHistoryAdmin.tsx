import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import type { DateRangeValue } from "@/components/ui/DateRangePicker/types";
import { fetchWithAuth } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";
import { HistoryCoverageSkeleton } from "./HistoryCoverageSkeleton";
import { HistoryCoverageTotals } from "./HistoryCoverageTotals";
import { HistorySeriesCoverage } from "./HistorySeriesCoverage";
import type { HistoryCoverage } from "./types";

function initialRange() {
	const end = subDays(new Date(), 1);
	return { endDate: format(end, "yyyy-MM-dd"), startDate: format(subDays(end, 364), "yyyy-MM-dd") };
}
export function FinancialHistoryAdmin() {
	const [range, setRange] = useState<DateRangeValue>(initialRange);
	const [kind, setKind] = useState("ALL");
	const userId = useAuthStore(state => state.user?.id);
	const startDate = range.startDate;
	const endDate = range.endDate ?? startDate;
	const valid =
		!!startDate &&
		!!endDate &&
		startDate <= endDate &&
		endDate < format(new Date(), "yyyy-MM-dd") &&
		(Date.parse(endDate) - Date.parse(startDate)) / 86400000 < 3660;
	const query = useQuery({
		enabled: valid,
		queryFn: () =>
			fetchWithAuth<HistoryCoverage>(
				`/financial-history/admin/coverage?startDate=${startDate}&endDate=${endDate}`,
			),
		queryKey: ["admin-history-coverage", userId, startDate, endDate],
		retry: false,
	});
	return (
		<section className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:p-6">
			<div>
				<h2 className="font-semibold text-lg">Cobertura histórica</h2>
				<p className="text-muted-foreground text-sm">
					Juros e conversões salvos no banco. Dias consultados sem publicação oficial também têm cobertura.
					Consulta não inicia coletas.
				</p>
			</div>
			<div className="grid min-w-0 gap-3 sm:grid-cols-2">
				<div className="grid min-w-0 content-start gap-2">
					<p className="font-medium text-sm">Período</p>
					<DateRangePicker
						onChange={value => setRange(value.startDate ? value : initialRange())}
						value={range}
					/>
				</div>
				<CustomSelect
					label="Tipo de histórico"
					onValueChange={setKind}
					options={[
						{ label: "Todos", value: "ALL" },
						{ label: "Juros", value: "INTEREST" },
						{ label: "Conversões", value: "CURRENCY" },
					]}
					placeholder="Todos os históricos"
					value={kind}
				/>
			</div>
			<ActionGroup>
				<Button disabled={!valid || query.isFetching} onClick={() => void query.refetch()} variant="outline">
					<LuRefreshCw />
					Atualizar
				</Button>
			</ActionGroup>
			{!valid ? (
				<p role="alert">Escolha até 3.660 dias, encerrados antes de hoje.</p>
			) : query.isPending ? (
				<HistoryCoverageSkeleton />
			) : query.isError ? (
				<p role="alert">{query.error.message}</p>
			) : (
				query.data && (
					<>
						<HistoryCoverageTotals data={query.data} />
						<p className="text-muted-foreground text-xs">
							Verde: dados salvos. Azul: consultado sem publicação. Vermelho: sem cobertura. Cada bloco
							representa um dia. Snapshots cambiais representam uma data e moeda-base, com múltiplas
							conversões.
						</p>
						{query.data.series
							.filter(series => kind === "ALL" || series.kind === kind)
							.map(series => (
								<HistorySeriesCoverage
									data={series}
									key={`${series.kind}:${series.series}`}
									requestedDays={query.data.requestedDays}
								/>
							))}
						{!query.data.series.some(series => kind === "ALL" || series.kind === kind) && (
							<p>Nenhum histórico desse tipo registrado.</p>
						)}
					</>
				)
			)}
		</section>
	);
}
