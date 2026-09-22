import Elysia from "elysia";
import { requireUserId } from "~/modules/auth";
import type { CacheNamespace } from "~/shared/infra/cache";
import { distributedCache } from "~/shared/infra/cache";

const transactionNamespaces = (pathname: string): CacheNamespace[] => {
	const id = pathname.match(/^\/transactions\/([^/]+)/)?.[1];
	return [
		"accounts:list",
		"dashboard",
		"transactions:list",
		...(id && id !== "transfer-suggestions" ? ([`transactions:detail:${id}`] as const) : []),
	];
};

export const DataConsistencyPlugin = new Elysia({ name: "DataConsistencyPlugin" })
	.derive(async ({ request }) => {
		const pathname = new URL(request.url).pathname;
		if (["GET", "HEAD", "OPTIONS"].includes(request.method) || !pathname.startsWith("/transactions"))
			return { cacheWriteFence: null };
		const userId = await requireUserId(request);
		const namespaces = transactionNamespaces(pathname);
		await distributedCache.beginWrite(userId, namespaces);
		return { cacheWriteFence: { namespaces, userId } };
	})
	.onAfterHandle(async ({ cacheWriteFence, set }) => {
		if (!cacheWriteFence || Number(set.status ?? 200) >= 400) return;
		await distributedCache.finishWrite(cacheWriteFence.userId, cacheWriteFence.namespaces);
	})
	.as("global");
