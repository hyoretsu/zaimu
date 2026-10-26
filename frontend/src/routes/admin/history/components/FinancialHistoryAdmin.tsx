import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import type { ComponentProps } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { z } from "zod";
import { FinancialSourceCoverage } from "@/components/financial-coverage";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import type { DateRangeValue } from "@/components/ui/DateRangePicker/types";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { useUrlViewState } from "@/hooks/use-url-view-state";
import { getFinancialHistoryAdminCoverage } from "@/lib/api";
import { viewDateRange, viewDateRangeParameters } from "@/lib/view-state";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import { useCurrencyStore } from "@/stores/currency";
import { HistoryCoverageSkeleton } from "./HistoryCoverageSkeleton";
import { HistoryCoverageTotals } from "./HistoryCoverageTotals";
import { HistorySeriesCoverage } from "./HistorySeriesCoverage";

function initialRange() {
	const end = subDays(new Date(), 1);
	return { endDate: format(end, "yyyy-MM-dd"), startDate: format(subDays(end, 364), "yyyy-MM-dd") };
}
export function FinancialHistoryAdmin({ header }: { header: ComponentProps<typeof PageHeader> }) {
	const [range, setRange] = useUrlViewState<DateRangeValue>(
		"admin.history.range",
		initialRange,
		viewDateRange,
		viewDateRangeParameters,
	);
	const [kind, setKind] = useUrlViewState<"CURRENCY" | "INTEREST">(
		"kind",
		"INTEREST",
		z.enum(["CURRENCY", "INTEREST"]),
	);
	const [rate, setRate] = useUrlViewState<string>("rate", "CDI", z.enum(["CDI", "SELIC"]));
	const [currency, setCurrency] = useUrlViewState("currency", "BRL", z.string().regex(/^[A-Z]{3}$/));
	const currencies = useCurrencyStore(state => state.currencies);
	const series = kind === "INTEREST" ? rate : currency;
	const userId = useAuthStore(state => state.user?.id);
	const startDate = range.startDate;
	const endDate = range.endDate ?? startDate;
	const valid =
		!!startDate && !!endDate && startDate <= endDate && endDate < format(new Date(), "yyyy-MM-dd");
	const query = useQuery({
		enabled: valid,
		queryFn: () => getFinancialHistoryAdminCoverage({ endDate, kind, series, startDate }),
		queryKey: ["admin-history-coverage", userId, startDate, endDate, kind, series],
		retry: false,
	});
	return (
		<>
			<PageHeader
				{...header}
				actions={[
					{
						disabled: !valid || query.isFetching,
						icon: LuRefreshCw,
						label: "Atualizar",
						onClick: () =>
							void query
								.refetch()
								.then(result =>
									showToast(
										result.isError ? result.error.message : "Cobertura atualizada.",
										result.isError ? "negative" : "info",
									),
								),
					},
				]}
			/>
			<section className="bg-card grid min-w-0 gap-4 rounded-2xl border p-4 sm:p-6">
				<div>
					<h2 className="text-lg font-semibold">Cobertura histórica</h2>
					<p className="text-muted-foreground text-sm">
						Juros e conversões salvos no banco. Dias consultados sem publicação oficial também têm
						cobertura. Consulta não inicia coletas.
					</p>
				</div>
				<FormFieldRow className="grid-cols-1 lg:grid-cols-[minmax(18rem,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
					<div className="grid min-w-0 content-start gap-2">
						<p className="text-sm font-medium">Período</p>
						<DateRangePicker
							onChange={value => setRange(value.startDate ? value : initialRange())}
							value={range}
						/>
					</div>
					<CustomSelect
						label="Tipo de histórico"
						onValueChange={value => {
							if (value === "CURRENCY" || value === "INTEREST") setKind(value);
						}}
						options={[
							{ label: "Juros", value: "INTEREST" },
							{ label: "Câmbio", value: "CURRENCY" },
						]}
						placeholder="Ex: Juros"
						value={kind}
					/>
					<CustomSelect
						label={kind === "INTEREST" ? "Taxa" : "Moeda base"}
						onValueChange={kind === "INTEREST" ? setRate : setCurrency}
						options={(kind === "INTEREST"
							? ["CDI", "SELIC"]
							: [...new Set([...currencies, currency])]
						).map(value => ({ label: value, value }))}
						placeholder={kind === "INTEREST" ? "Ex: CDI" : "Ex: BRL"}
						searchable={kind === "CURRENCY"}
						value={series}
					/>
				</FormFieldRow>
				{!valid ? (
					<p role="alert">Escolha um intervalo válido, encerrado antes de hoje.</p>
				) : query.isPending ? (
					<HistoryCoverageSkeleton />
				) : query.isError ? (
					<p role="alert">{query.error.message}</p>
				) : (
					query.data && (
						<>
							<HistoryCoverageTotals data={query.data} />
							<p className="text-muted-foreground text-xs">
								Cada bloco representa um dia. Snapshots cambiais representam uma data e
								moeda-base, com múltiplas conversões.
							</p>
							{query.data.series.map(series => (
								<HistorySeriesCoverage
									data={series}
									endDate={endDate!}
									key={`${series.kind}:${series.series}`}
									requestedDays={query.data.requestedDays}
									startDate={startDate!}
								/>
							))}
							{!query.data.series.length && <p>Nenhum histórico desse tipo registrado.</p>}
						</>
					)
				)}
			</section>
			{valid && <FinancialSourceCoverage endDate={endDate!} startDate={startDate!} />}
		</>
	);
}
