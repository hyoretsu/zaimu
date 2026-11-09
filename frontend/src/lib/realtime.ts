import type { QueryClient } from "@tanstack/react-query";
import { apiUrl } from "./auth-client";
import { activeCurrency } from "./currency-context";
import { invalidateMutationCache } from "./mutation-cache";
import type { CacheIdentity } from "./query-cache";
import { type CacheOperations, realtimeCacheOperations } from "./realtime-operations";
import { createYieldRecalculationToast } from "./yield-recalculation-toast";

const flushDelayMs = 300;

type BatchListener = () => void;
const batchListeners = new Map<string, Set<BatchListener>>();
const allBatchListeners = () => [...batchListeners.values()].flatMap(listeners => [...listeners]);

/** Calls `listener` when the worker reports progress on the batch, and after every stream (re)connect. */
export function onImportBatchProgress(batchId: string, listener: BatchListener) {
	const listeners = batchListeners.get(batchId) ?? new Set<BatchListener>();
	listeners.add(listener);
	batchListeners.set(batchId, listeners);
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) batchListeners.delete(batchId);
	};
}

/** Refetch the domains touched by background work (worker jobs) that finish after the HTTP response. */
export function connectRealtimeInvalidation(
	client: QueryClient,
	identity: CacheIdentity,
	getIdentity: () => CacheIdentity | null,
) {
	const source = new EventSource(`${apiUrl}/realtime/stream`, { withCredentials: true });
	const yieldToast = createYieldRecalculationToast();
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
	// Progress pushed while the stream was down is lost, so waiters re-read on every (re)connect.
	source.addEventListener("ready", () => {
		for (const listener of allBatchListeners()) listener();
	});
	source.addEventListener("domain", event => {
		const { aggregateId, aggregateType, eventType } = JSON.parse(
			(event as MessageEvent<string>).data,
		) as {
			aggregateId?: string;
			aggregateType: string;
			eventType?: string;
		};
		if (aggregateType === "yieldRecalculation") {
			yieldToast.start(aggregateId);
			return;
		}
		if (aggregateType === "financialAccount" && eventType === "yieldRecalculated")
			yieldToast.finish(aggregateId);
		if (aggregateType === "importBatch") {
			for (const listener of batchListeners.get(aggregateId ?? "") ?? []) listener();
			return;
		}
		for (const operation of realtimeCacheOperations(aggregateType)) pending.add(operation);
		if (pending.size > 0) timer ??= setTimeout(flush, flushDelayMs);
	});
	return () => {
		clearTimeout(timer);
		yieldToast.dispose();
		source.close();
	};
}
