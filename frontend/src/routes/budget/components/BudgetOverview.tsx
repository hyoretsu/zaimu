import { useQuery } from "@tanstack/react-query";
import { monthEnd } from "@zaimu/finance/monthly-budget";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { useCurrencyStore } from "@/stores/currency";
import { BudgetMonthPicker } from "./BudgetMonthPicker";
import { budgetMoney } from "./budget-display";

export function BudgetOverview({
	month,
	onMonthChange,
}: {
	month: string;
	onMonthChange: (month: string) => void;
}) {
	const identity = useCacheIdentity();
	const currency = useCurrencyStore(state => state.currency);
	const currencyReady = useCurrencyStore(state => !state.loading && state.owner === identity);
	const parameters = {
		endDate: monthEnd(month),
		excludeYields: true,
		periodsAfter: 0,
		periodsBefore: 0,
		startDate: `${month}-01`,
	};
	const forecast = useQuery({
		enabled: identity !== null && currencyReady,
		queryFn: () => dataService.dashboard.getComparison(parameters),
		queryKey: queryKeys.dashboard.comparison(identity!, parameters),
	});
	const period = forecast.data?.[0];
	return (
		<section aria-label="Disponibilidade do mês" className="space-y-4 border-b pb-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-semibold">Disponibilidade do mês</h2>
				<BudgetMonthPicker month={month} onChange={onMonthChange} />
			</div>
			{!currencyReady || forecast.isPending ? (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
					{[1, 2, 3].map(key => (
						<div className="space-y-2" key={key}>
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-7 w-32" />
						</div>
					))}
				</div>
			) : forecast.isError || !period ? (
				<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
					<p className="text-muted-foreground">Não foi possível calcular disponibilidade deste mês.</p>
					<Button
						onClick={() => {
							void forecast.refetch();
							showToast("Atualização solicitada.", "info");
						}}
						size="sm"
						variant="outline"
					>
						Tentar novamente
					</Button>
				</div>
			) : (
				<>
					<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						<div>
							<dt className="text-muted-foreground text-xs">Entradas previstas</dt>
							<dd className="mt-1 font-semibold text-lg tabular-nums">
								{budgetMoney(period.income, currency)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">Despesas previstas</dt>
							<dd className="mt-1 font-semibold text-lg tabular-nums">
								{budgetMoney(period.expenses, currency)}
							</dd>
						</div>
						<div className="col-span-2 sm:col-span-1">
							<dt className="text-muted-foreground text-xs">Disponível para planejar</dt>
							<dd
								className={`mt-1 font-bold text-xl tabular-nums ${period.net < 0 ? "text-destructive" : "text-primary"}`}
							>
								{budgetMoney(period.net, currency)}
							</dd>
						</div>
					</dl>
					<p className="text-muted-foreground text-xs">
						Entradas realizadas e agendadas no mês, sem rendimentos. Despesas incluem plano, ajustes e gastos
						conhecidos, sem duplicação. Saldo anterior não entra neste limite.
					</p>
					{forecast.isFetching && (
						<p className="text-muted-foreground text-xs" role="status">
							Atualizando previsão...
						</p>
					)}
				</>
			)}
		</section>
	);
}
