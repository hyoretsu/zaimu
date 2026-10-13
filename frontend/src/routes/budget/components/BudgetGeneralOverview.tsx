import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import { guestRate } from "@/lib/currency-conversion";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { monthlyBudgetService } from "@/lib/monthly-budget-service";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { useCurrencyStore } from "@/stores/currency";
import { budgetMoney } from "./budget-display";
import { generalBudgetAvailability } from "./budget-general";

export function BudgetGeneralOverview() {
	const identity = useCacheIdentity();
	const currency = useCurrencyStore(state => state.currency);
	const ready = useCurrencyStore(state => !state.loading && state.owner === identity);
	const today = getLocalDateKey();
	const overview = useQuery({
		enabled: identity !== null && ready,
		queryFn: async () => {
			const [recurrences, budgets] = await Promise.all([
				dataService.recurrences.getAll(),
				monthlyBudgetService.getAll(),
			]);
			return generalBudgetAvailability({ budgets, currency, rate: guestRate, recurrences, today });
		},
		queryKey: [...queryKeys.dashboard.all(identity!), "budget-general", currency, today],
	});
	return (
		<section aria-label="Disponibilidade do plano geral" className="space-y-4 border-b pb-5">
			<h2 className="font-semibold">Disponibilidade do plano geral</h2>
			{!ready || overview.isPending ? (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
					{[1, 2, 3].map(key => (
						<Skeleton className="h-12" key={key} />
					))}
				</div>
			) : overview.isError ? (
				<p className="text-muted-foreground text-sm">
					Não foi possível calcular disponibilidade do plano geral.
				</p>
			) : (
				<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
					{[
						["Renda fixa recorrente", overview.data.income],
						["Despesas planejadas", overview.data.expenses],
						["Disponível para planejar", overview.data.net],
					].map(([label, amount]) => (
						<div
							className={label === "Disponível para planejar" ? "col-span-2 sm:col-span-1" : undefined}
							key={label}
						>
							<dt className="text-muted-foreground text-xs">{label}</dt>
							<dd className="mt-1 font-semibold text-lg tabular-nums">
								{budgetMoney(Number(amount), currency)}
							</dd>
						</div>
					))}
				</dl>
			)}
			<p className="text-muted-foreground text-xs">
				Base mensal das entradas recorrentes ativas, como salários, menos despesas do plano geral.
				Recebimentos extras e ajustes aparecem em Ajustes por mês. Rendimentos não entram no orçamento.
			</p>
		</section>
	);
}
