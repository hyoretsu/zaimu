import { useQuery } from "@tanstack/react-query";
import { HistoryCollectionProgress } from "@/components/currency/HistoryCollectionProgress";
import { refreshReferenceRateAverages } from "@/lib/reference-rate-averages";
export function DashboardReferenceRateNotice({ available }: { available: boolean }) {
	const rates = useQuery({
		enabled: !available,
		queryFn: refreshReferenceRateAverages,
		queryKey: ["reference-rate-averages"],
		refetchInterval: available ? false : 10_000,
	});
	if (available) return null;
	return (
		<div className="space-y-3">
			<p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">
				Parcela pós-fixada da previsão indisponível até concluir histórico de dez anos de CDI/Selic. Saldos
				registrados e parcela prefixada continuam disponíveis.
			</p>
			{rates.data?.collectionId && (
				<HistoryCollectionProgress collectionId={rates.data.collectionId} title="Histórico CDI/Selic" />
			)}
		</div>
	);
}
