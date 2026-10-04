import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { ChartPeriodFilter, type ChartPeriodSettings, DashboardPeriodChart } from "./components";

function formatAxisLabel(startDate: string) {
	const date = new Date(`${startDate}T12:00:00`);
	return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`;
}

export function DashboardComparisonChart() {
	const identity = useCacheIdentity();
	const [settings, setSettings] = useState<ChartPeriodSettings>(() => ({
		endDate: format(endOfMonth(new Date()), "yyyy-MM-dd"),
		periodsAfter: 10,
		periodsBefore: 1,
		startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
	}));

	const query = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.dashboard.getComparison(settings),
		queryKey: queryKeys.dashboard.comparison(identity!, settings),
	});
	const today = format(new Date(), "yyyy-MM-dd");
	const data = (query.data ?? []).map(item => ({
		...item,
		label: formatAxisLabel(item.startDate),
	}));
	const currentPeriod = data.find(item => item.startDate <= today && today <= item.endDate);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Evolução por período</CardTitle>
				<p className="text-muted-foreground text-sm">
					{settings.periodsBefore + 1 + settings.periodsAfter} períodos: {settings.periodsBefore} anteriores,
					período de referência e {settings.periodsAfter} posteriores.
				</p>
				<ChartPeriodFilter onChange={setSettings} value={settings} />
			</CardHeader>
			<CardContent>
				{query.isPending ? (
					<div aria-label="Carregando evolução por período" className="space-y-6" role="status">
						{["Patrimônio", "Entradas e gastos"].map(title => (
							<div className="space-y-4" key={title}>
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-64 w-full" />
								<Skeleton className="mx-auto h-4 w-64 max-w-full" />
							</div>
						))}
					</div>
				) : query.isError ? (
					<p className="py-12 text-center text-muted-foreground">
						Não foi possível carregar o gráfico. Selecione o período novamente para tentar.
					</p>
				) : (
					<div className="space-y-6">
						<DashboardPeriodChart currentPeriod={currentPeriod?.label} data={data} kind="balances" />
						<DashboardPeriodChart currentPeriod={currentPeriod?.label} data={data} kind="flows" />
					</div>
				)}
			</CardContent>
		</Card>
	);
}
