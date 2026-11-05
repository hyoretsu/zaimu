import type { QueryClient } from "@tanstack/react-query";
import { apiUrl } from "./auth-client";
import { activeCurrency } from "./currency-context";
import { invalidateMutationCache } from "./mutation-cache";
import type { CacheIdentity } from "./query-cache";
import { type CacheOperations, realtimeCacheOperations } from "./realtime-operations";

const flushDelayMs = 300;

/** Refetch the domains touched by background work (worker jobs) that finish after the HTTP response. */
export function connectRealtimeInvalidation(
	client: QueryClient,
	identity: CacheIdentity,
	getIdentity: () => CacheIdentity | null,
) {
	const source = new EventSource(`${apiUrl}/realtime/stream`, { withCredentials: true });
	const pending = new Set<CacheOperations[number]>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const flush = () => {
		timer = undefined;
		const cacheOperations = [...pending];
		pending.clear();
		void invalidateMutationCache(
			client,
			{ currency: activeCurrency(), identity },
			{ cacheOperations },
			getIdentity,
		).catch(() => undefined);
	};
	source.addEventListener("domain", event => {
		const { aggregateType } = JSON.parse((event as MessageEvent<string>).data) as {
			aggregateType: string;
		};
		for (const operation of realtimeCacheOperations(aggregateType)) pending.add(operation);
		if (pending.size > 0) timer ??= setTimeout(flush, flushDelayMs);
	});
	return () => {
		clearTimeout(timer);
		source.close();
	};
}
