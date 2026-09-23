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

export const writeNamespaces = (pathname: string): CacheNamespace[] => {
	if (pathname.startsWith("/transactions")) return transactionNamespaces(pathname);
	if (pathname.startsWith("/credit-cards")) {
		const cardId = pathname.match(/^\/credit-cards\/([^/]+)/)?.[1];
		return [
			"accounts:list",
			"credit-cards:overview",
			"dashboard",
			...(cardId ? ([`credit-cards:${cardId}:statements`] as const) : []),
		];
	}
	if (pathname.startsWith("/financial-accounts"))
		return ["accounts:list", "credit-cards:overview", "dashboard", "transactions:list"];
	if (pathname.startsWith("/credit-card-imports")) {
		const importId = pathname.match(/^\/credit-card-imports\/([^/]+)/)?.[1];
		return [
			"credit-cards:overview",
			"imports:pending",
			"transactions:list",
			...(importId ? ([`imports:detail:${importId}`] as const) : []),
		];
	}
	if (pathname.startsWith("/transaction-imports")) {
		const importId = pathname.match(/^\/transaction-imports\/([^/]+)/)?.[1];
		return [
			"accounts:list",
			"dashboard",
			"imports:pending",
			"transactions:list",
			...(importId ? ([`imports:detail:${importId}`] as const) : []),
		];
	}
	return [];
};

export const DataConsistencyPlugin = new Elysia({ name: "DataConsistencyPlugin" })
	.derive(async ({ request }) => {
		const pathname = new URL(request.url).pathname;
		if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return { cacheWriteFence: null };
		const namespaces = writeNamespaces(pathname);
		if (namespaces.length === 0) return { cacheWriteFence: null };
		const userId = await requireUserId(request);
		await distributedCache.beginWrite(userId, namespaces);
		return { cacheWriteFence: { namespaces, userId } };
	})
	.onAfterHandle(async ({ cacheWriteFence, set }) => {
		if (!cacheWriteFence || Number(set.status ?? 200) >= 400) return;
		await distributedCache.finishWrite(cacheWriteFence.userId, cacheWriteFence.namespaces);
	})
	.as("global");
