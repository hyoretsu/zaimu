import { useQuery } from "@tanstack/react-query";
import { HistoryCollectionObserver } from "@/components/currency/HistoryCollectionObserver";
import { refreshReferenceRateAverages } from "@/lib/reference-rate-averages";

export function DashboardReferenceRateNotice() {
	const rates = useQuery({
		queryFn: refreshReferenceRateAverages,
		queryKey: ["reference-rate-averages"],
		refetchInterval: query => (query.state.data?.ready ? false : 10_000),
	});
	const averages = rates.data?.averages;
	return (
		<div className="mt-3 space-y-3 text-left">
			{averages && (
				<p className="text-muted-foreground text-sm">
					Juros diários considerados:{" "}
					{(["CDI", "SELIC"] as const)
						.map(type => {
							const value = averages[type];
							return `${type === "SELIC" ? "Selic" : type}: ${value === null ? "indisponível" : `${(Math.floor(value * 1000) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3, minimumFractionDigits: 3 })}%`}`;
						})
						.join("; ")}
					.
				</p>
			)}
			{rates.data?.collectionId && <HistoryCollectionObserver collectionId={rates.data.collectionId} />}
		</div>
	);
}
