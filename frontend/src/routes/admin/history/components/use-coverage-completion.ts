import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/dataService";
import type { HistoryCollection } from "@/lib/financial-history";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import type { HistoryCoverageSeries } from "./types";

export function useCoverageCompletion(data: HistoryCoverageSeries) {
	const client = useQueryClient();
	const userId = useAuthStore(state => state.user?.id);
	const [collectionId, setCollectionId] = useState<string>();
	const collection = useQuery({
		enabled: !!collectionId,
		queryFn: () => fetchWithAuth<HistoryCollection>(`/financial-history/collections/${collectionId}`),
		queryKey: ["admin-history-completion", userId, collectionId],
		refetchInterval: query =>
			query.state.data && !["PENDING", "RUNNING"].includes(query.state.data.progress.state) ? false : 2000,
	});
	useEffect(() => {
		if (!collection.data) return;
		void client.invalidateQueries({ queryKey: ["admin-history-coverage", userId] });
	}, [client, userId, collection.data]);
	const complete = useMutation({
		mutationFn: async (range: { startDate: string; endDate: string }) => {
			const value = await fetchWithAuth<HistoryCollection | null>(
				"/financial-history/admin/coverage/complete",
				{
					body: JSON.stringify({ ...range, kind: data.kind, series: data.series }),
					method: "POST",
				},
			);
			if (!value) throw new Error("Coleta indisponível. Tente novamente.");
			return value;
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: value => {
			client.setQueryData(["admin-history-completion", userId, value.id], value);
			setCollectionId(value.id);
			showToast("Coleta solicitada. A cobertura será atualizada durante o processamento.", "positive");
		},
	});
	const retry = useMutation({
		mutationFn: () =>
			fetchWithAuth<HistoryCollection>(`/financial-history/collections/${collectionId}/retry`, {
				method: "POST",
			}),
		onError: error => showToast(error.message, "negative"),
		onSuccess: value => {
			client.setQueryData(["admin-history-completion", userId, value.id], value);
			showToast("Nova tentativa solicitada.", "positive");
		},
	});
	const progress = collection.data?.progress;
	return {
		complete: complete.mutate,
		error: collection.error,
		pending:
			complete.isPending ||
			retry.isPending ||
			(!!progress && ["PENDING", "RUNNING"].includes(progress.state)),
		progress,
		refresh: collection.refetch,
		retry: retry.mutate,
	};
}
