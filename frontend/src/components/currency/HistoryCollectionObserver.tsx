import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { readHistoryCollection } from "@/lib/financial-history";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

export function HistoryCollectionObserver({ collectionId }: { collectionId: string }) {
	const owner = useCacheIdentity();
	const queryClient = useQueryClient();
	const queryKey = ["identity", owner, "financial-history", collectionId];
	const query = useQuery({
		enabled: !!owner,
		queryFn: () => readHistoryCollection(collectionId),
		queryKey,
		refetchInterval: query =>
			["PENDING", "RUNNING"].includes(query.state.data?.progress.state ?? "") ? 10_000 : false,
	});
	const previousState = useRef<{ id: string; state: string } | null>(null);
	useEffect(() => {
		const state = query.data?.progress.state;
		if (!state || !owner) return;
		const previous = previousState.current;
		previousState.current = { id: collectionId, state };
		if (previous?.id === collectionId && previous.state !== state) {
			void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(owner) });
		}
	}, [collectionId, owner, query.data?.progress.state, queryClient]);
	return null;
}
