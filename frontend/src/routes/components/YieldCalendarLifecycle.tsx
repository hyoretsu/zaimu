import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { cachedYieldCalendar, fetchYieldCalendar } from "@/lib/yield-calendar";
import { useAuthStore } from "@/stores";
import { AppLoadingState } from "./AppLoadingState";

export function YieldCalendarLifecycle({ children }: { children: ReactNode }) {
	const enabled = useAuthStore(state => state.isInitialized && (state.isAuthenticated || state.isGuestMode));
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const query = useQuery({
		enabled,
		queryFn: async () => {
			const calendar = await fetchYieldCalendar();
			if (identity) await invalidateCacheOperation(client, identity, "holiday");
			return calendar;
		},
		queryKey: ["yield-calendar"],
		retry: false,
		staleTime: 60000,
	});
	if (enabled && query.isPending) return <AppLoadingState />;
	if (enabled && query.isError && !cachedYieldCalendar().countries.length)
		return (
			<div className="grid gap-4 p-4">
				<p role="alert">Não foi possível carregar o calendário de rendimentos.</p>
				<ActionGroup>
					<Button onClick={() => void query.refetch()} variant="outline">
						Tentar novamente
					</Button>
				</ActionGroup>
			</div>
		);
	return children;
}
