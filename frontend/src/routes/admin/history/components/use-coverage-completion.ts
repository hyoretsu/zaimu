import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	getFinancialHistoryCollectionsById,
	postFinancialHistoryAdminCoverageComplete,
	postFinancialHistoryCollectionsByIdRetry,
} from "@/lib/api";
import { mutationCacheMeta } from "@/lib/mutation-cache";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import type { HistoryCoverageSeries } from "./types";

export function useCoverageCompletion(data: HistoryCoverageSeries) {
	const client = useQueryClient();
	const userId = useAuthStore(state => state.user?.id);
	const [collectionId, setCollectionId] = useState<string>();
	const collection = useQuery({
		enabled: !!collectionId,
		queryFn: () => {
			if (!collectionId) throw new Error("Coleta indisponível.");
			return getFinancialHistoryCollectionsById(collectionId);
		},
		queryKey: ["admin-history-completion", userId, collectionId],
		refetchInterval: query =>
			query.state.data && !["PENDING", "RUNNING"].includes(query.state.data.progress.state) ? false : 2000,
	});
	useEffect(() => {
		if (!collection.data) return;
		void client.invalidateQueries({ queryKey: ["admin-history-coverage", userId] });
	}, [client, userId, collection.data]);
	const complete = useMutation({
		meta: mutationCacheMeta("history"),
		mutationFn: async (range: { startDate: string; endDate: string }) => {
			const value = await postFinancialHistoryAdminCoverageComplete({
				...range,
				kind: data.kind,
				series: data.series,
			});
			if (!value) throw new Error("Coleta indisponível. Tente novamente.");
			return value;
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: value => {
			if (value) client.setQueryData(["admin-history-completion", userId, value.id], value);
			setCollectionId(value.id);
			showToast("Coleta solicitada. A cobertura será atualizada durante o processamento.", "positive");
		},
	});
	const retry = useMutation({
		meta: mutationCacheMeta("history"),
		mutationFn: () => {
			if (!collectionId) throw new Error("Coleta indisponível.");
			return postFinancialHistoryCollectionsByIdRetry(collectionId);
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: value => {
			if (value) client.setQueryData(["admin-history-completion", userId, value.id], value);
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
