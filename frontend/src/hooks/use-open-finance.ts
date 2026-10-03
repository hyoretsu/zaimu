import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { openFinanceApi } from "@/lib/api";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast, useAuthStore } from "@/stores";
export const openFinanceKeys = {
	configuration: (identity: string | null) =>
		["identity", identity, "open-finance", "configuration"] as const,
	status: (identity: string | null) => ["identity", identity, "open-finance", "status"] as const,
};
export function useOpenFinanceConfiguration() {
	const identity = useCacheIdentity();
	const authenticated = useAuthStore(s => s.isAuthenticated);
	return useQuery({
		enabled: authenticated && Boolean(identity),
		queryFn: openFinanceApi.configuration,
		queryKey: openFinanceKeys.configuration(identity),
		retry: false,
	});
}
export function useOpenFinanceStatus(enabled: boolean) {
	const identity = useCacheIdentity();
	return useQuery({
		enabled: enabled && Boolean(identity),
		queryFn: openFinanceApi.status,
		queryKey: openFinanceKeys.status(identity),
		refetchInterval: query =>
			["QUEUED", "RUNNING"].includes(query.state.data?.run?.status ?? "") ? 1500 : false,
		retry: false,
	});
}
export function useOpenFinanceAutoSync() {
	const identity = useCacheIdentity();
	const configuration = useOpenFinanceConfiguration();
	const enabled = configuration.data?.configured === true && configuration.data.available;
	const status = useOpenFinanceStatus(enabled);
	const client = useQueryClient();
	const observedRun = useRef<string | null>(null);

	useEffect(() => {
		if (!enabled || !identity) return;
		let active = true;
		let searching = false;
		const search = async () => {
			if (searching) return;
			searching = true;
			try {
				const result = await openFinanceApi.sync();
				if (active && result.runId) observedRun.current = result.runId;
				if (active) await client.invalidateQueries({ queryKey: openFinanceKeys.status(identity) });
			} catch (error) {
				if (active)
					showToast(
						error instanceof Error ? error.message : "Não foi possível buscar dados MeuPluggy",
						"negative",
					);
			} finally {
				searching = false;
			}
		};
		const onVisible = () => {
			if (document.visibilityState === "visible") void search();
		};
		void search();
		window.addEventListener("focus", onVisible);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			active = false;
			window.removeEventListener("focus", onVisible);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [client, enabled, identity]);
	useEffect(() => {
		const run = status.data?.run;
		if (!run || !identity) return;
		if (["QUEUED", "RUNNING"].includes(run.status)) {
			observedRun.current = run.id;
			return;
		}
		if (observedRun.current !== run.id) return;
		observedRun.current = null;
		void client.invalidateQueries({
			predicate: query => !query.queryKey.includes("open-finance"),
			queryKey: ["identity", identity],
		});
		void client.invalidateQueries({ queryKey: openFinanceKeys.configuration(identity) });
		showToast(
			run.errors.length
				? "Busca MeuPluggy concluída com pendências. Confira Open Finance."
				: `MeuPluggy: ${run.imported} registros importados, ${run.pending} pendências.`,
			run.errors.length ? "negative" : "positive",
		);
	}, [client, identity, status.data]);
}
