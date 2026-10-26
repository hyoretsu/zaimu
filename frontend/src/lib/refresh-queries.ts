import type { InvalidateQueryFilters, Query, QueryClient } from "@tanstack/react-query";

interface PendingRefresh {
	dirty: boolean;
	promise: Promise<void>;
}

const pendingRefreshes = new WeakMap<Query, PendingRefresh>();

/** Share reads without cancellation; writes arriving during a read get one trailing refresh. */
export async function refreshQueries(client: QueryClient, filters: InvalidateQueryFilters): Promise<void> {
	await client.invalidateQueries({ ...filters, refetchType: "none" });
	await Promise.all(
		client
			.getQueryCache()
			.findAll({ ...filters, type: "active" })
			.map(query => {
				const pending = pendingRefreshes.get(query);
				if (pending) {
					pending.dirty = true;
					return pending.promise;
				}
				const refresh: PendingRefresh = {
					dirty: false,
					promise: Promise.resolve(),
				};
				pendingRefreshes.set(query, refresh);
				refresh.promise = (async () => {
					try {
						// An existing read may predate the write. Await it before fetching the new state.
						do {
							const alreadyFetching = query.state.fetchStatus === "fetching";
							refresh.dirty = false;
							try {
								await client.refetchQueries(
									{ exact: true, queryKey: query.queryKey, type: "active" },
									{ cancelRefetch: false, throwOnError: true },
								);
							} catch (error) {
								if (!alreadyFetching && !refresh.dirty) throw error;
							}
							if (alreadyFetching) refresh.dirty = true;
						} while (refresh.dirty);
					} finally {
						pendingRefreshes.delete(query);
					}
				})();
				return refresh.promise;
			}),
	);
}
