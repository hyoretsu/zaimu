import Elysia from "elysia";
import { requireUserId } from "~/modules/auth";
import { syncCacheNamespaces } from "~/shared/application/cache-invalidation";
import { createEventEnvelope } from "~/shared/application/events";
import type { CacheNamespace } from "~/shared/infra/cache";
import { distributedCache } from "~/shared/infra/cache";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { queryRaw } from "~/shared/infra/sql";
import { afterMutationCommit, runMutationRequest } from "./mutation-transaction";

const outbox = new PostgresOutbox();

export const debtResourceId = (pathname: string) =>
	pathname.match(/^\/debts\/(?:events|people|invitations)\/([^/]+)/)?.[1];

async function debtAffectedUserIds(resourceId: string | undefined) {
	if (!resourceId) return [];
	const rows = await queryRaw<{ userId: string }>(
		`WITH target_event AS (
			SELECT "createdByUserId", "connectionId", "debtPersonId" FROM "public"."DebtEvent" WHERE "id" = $1
		), target_person AS (
			SELECT "userId", "connectionId" FROM "public"."DebtPerson" WHERE "id" = $1
		), target_connections AS (
			SELECT "id", "requesterId", "recipientId" FROM "public"."DebtConnection"
			WHERE "id" = $1
			   OR "id" IN (SELECT "connectionId" FROM target_event WHERE "connectionId" IS NOT NULL)
			   OR "id" IN (SELECT "connectionId" FROM target_person WHERE "connectionId" IS NOT NULL)
		)
		SELECT "createdByUserId" AS "userId" FROM target_event
		UNION SELECT "userId" FROM target_person
		UNION SELECT "requesterId" FROM target_connections
		UNION SELECT "recipientId" FROM target_connections
		UNION SELECT visibility."userId" FROM "public"."DebtEventVisibility" visibility WHERE visibility."eventId" = $1`,
		[resourceId],
	);
	return rows.map(row => row.userId);
}

async function creditAffectedUserIds(userId: string) {
	const rows = await queryRaw<{ userId: string }>(
		`SELECT CASE WHEN "requesterId"=$1 THEN "recipientId" ELSE "requesterId" END AS "userId" FROM "DebtConnection" WHERE "status"='ACCEPTED' AND ("requesterId"=$1 OR "recipientId"=$1)`,
		[userId],
	);
	return rows.map(row => row.userId);
}

const transactionNamespaces = (pathname: string): CacheNamespace[] => {
	const id = pathname.match(/^\/transactions\/([^/]+)/)?.[1];
	return [
		"accounts:list",
		"dashboard",
		"debts:events",
		"debts:overview",
		"transactions:list",
		...(!id || pathname.includes("/transfer-suggestions/") ? ["transactions:detail" as const] : []),
		...(id && id !== "transfer-suggestions" ? ([`transactions:detail:${id}`] as const) : []),
	];
};

const baseWriteNamespaces = (pathname: string): CacheNamespace[] => {
	if (pathname.startsWith("/balance-adjustments")) return ["accounts:list", "dashboard", "transactions:list"];
	if (pathname.startsWith("/transactions")) return transactionNamespaces(pathname);
	if (pathname.startsWith("/credit-cards")) {
		const cardId = pathname.match(/^\/credit-cards\/([^/]+)/)?.[1];
		return [
			"accounts:list",
			"credit-cards:overview",
			"debts:events",
			"debts:overview",
			"dashboard",
			"transactions:list",
			...(cardId ? ([`credit-cards:${cardId}:statements`] as const) : []),
		];
	}
	if (pathname.startsWith("/financial-accounts"))
		return ["accounts:list", "credit-cards:overview", "dashboard", "transactions:list"];
	if (pathname.startsWith("/credit-card-imports")) {
		const importId = pathname.match(/^\/credit-card-imports\/([^/]+)/)?.[1];
		return [
			"accounts:list",
			"credit-cards:overview",
			"debts:events",
			"debts:overview",
			"dashboard",
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
	if (
		pathname.startsWith("/financial-institutions") ||
		pathname.startsWith("/financial-account-yield-holidays") ||
		pathname.startsWith("/financial-account-yields")
	)
		return [
			"accounts:detail",
			"accounts:list",
			"accounts:rate-history",
			"accounts:yields",
			"dashboard",
			"transactions:list",
		];
	if (pathname.startsWith("/categories"))
		return ["categories:list", "dashboard", "schedules:overview", "transactions:list"];
	if (pathname.startsWith("/stores")) return ["stores:list", "transactions:list"];
	if (
		pathname.startsWith("/salaries") ||
		pathname.startsWith("/subscriptions") ||
		pathname.startsWith("/recurring")
	)
		return [
			"accounts:list",
			"credit-cards:overview",
			"debts:events",
			"debts:overview",
			"dashboard",
			"schedules:detail",
			"schedules:history",
			"schedules:overview",
			"transactions:list",
		];
	if (pathname.startsWith("/loans"))
		return [
			"dashboard",
			"loans:detail",
			"loans:history",
			"loans:installments",
			"loans:list",
			"transactions:list",
		];
	if (pathname.startsWith("/debts"))
		return ["debts:events", "debts:invitations", "debts:overview", "dashboard", "transactions:list"];
	if (pathname.startsWith("/sync")) return syncCacheNamespaces;
	return [];
};

export const writeNamespaces = (pathname: string): CacheNamespace[] => {
	const namespaces = baseWriteNamespaces(pathname);
	return !pathname.startsWith("/transactions") && namespaces.includes("transactions:list")
		? [...new Set<CacheNamespace>([...namespaces, "transactions:detail"])]
		: namespaces;
};

const aggregateForPath = (pathname: string) => {
	const [root, id] = pathname.split("/").filter(Boolean);
	const aggregateType =
		(
			{
				categories: "category",
				"credit-card-imports": "creditCardImport",
				"credit-cards": "creditCard",
				debts: "debt",
				"financial-account-yield-holidays": "financialAccount",
				"financial-account-yields": "financialAccount",
				"financial-accounts": "financialAccount",
				"financial-institutions": "financialAccount",
				loans: "loan",
				recurring: "schedule",
				salaries: "schedule",
				stores: "store",
				subscriptions: "schedule",
				sync: "sync",
				"transaction-imports": "transactionImport",
				transactions: "transaction",
			} as Record<string, string>
		)[root ?? ""] ?? "unknown";
	return { aggregateId: id && id.length <= 36 ? id : undefined, aggregateType };
};

const eventTypeForMethod = (method: string) => {
	if (method === "POST") return "created";
	if (method === "DELETE") return "deleted";
	return "updated";
};

export const DataConsistencyPlugin = new Elysia({ name: "DataConsistencyPlugin" })
	.wrap((handler, request) => async () => {
		const handle = async () => (await handler(request)) as unknown as Response;
		if (
			["GET", "HEAD", "OPTIONS"].includes(request.method) ||
			writeNamespaces(new URL(request.url).pathname).length === 0
		)
			return handle();
		return runMutationRequest(handle);
	})
	.derive(async ({ request }) => {
		const pathname = new URL(request.url).pathname;
		if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return { cacheWriteFence: null };
		const namespaces = writeNamespaces(pathname);
		if (namespaces.length === 0) return { cacheWriteFence: null };
		const userId = await requireUserId(request);
		const affectedUserIds = pathname.startsWith("/debts")
			? await debtAffectedUserIds(debtResourceId(pathname))
			: pathname.startsWith("/credit-cards") ||
					pathname.startsWith("/credit-card-imports") ||
					pathname.startsWith("/transactions") ||
					pathname.startsWith("/sync")
				? await creditAffectedUserIds(userId)
				: [];
		const userIds = [...new Set([userId, ...affectedUserIds])];
		const tokens = await Promise.all(
			userIds.map(affectedUserId => distributedCache.beginWrite(affectedUserId, namespaces)),
		);
		const fenceTokens = Object.fromEntries(userIds.map((id, index) => [id, tokens[index]]));
		return { cacheWriteFence: { fenceTokens, namespaces, pathname, userId, userIds } };
	})
	.onAfterHandle(async ({ cacheWriteFence, request, response, set }) => {
		if (!cacheWriteFence || Number(set.status ?? 200) >= 400) return;
		const aggregate = aggregateForPath(cacheWriteFence.pathname);
		const responseId =
			response && typeof response === "object" && "id" in response && typeof response.id === "string"
				? response.id
				: undefined;
		const debtUserIds = cacheWriteFence.pathname.startsWith("/debts")
			? await debtAffectedUserIds(responseId ?? debtResourceId(cacheWriteFence.pathname))
			: [];
		const userIds = [...new Set([...cacheWriteFence.userIds, ...debtUserIds])];
		const eventId = crypto.randomUUID();
		if (!cacheWriteFence.pathname.startsWith("/sync"))
			await outbox.append(
				createEventEnvelope({
					aggregateId: aggregate.aggregateId ?? cacheWriteFence.userId,
					aggregateType: aggregate.aggregateType,
					correlationId: request.headers.get("x-correlation-id")?.slice(0, 36) || eventId,
					eventId,
					eventType: eventTypeForMethod(request.method),
					payload: { method: request.method, pathname: cacheWriteFence.pathname },
					userIds,
				}),
			);
		afterMutationCommit(() =>
			Promise.all(
				userIds.map(userId =>
					distributedCache.finishWrite(
						userId,
						cacheWriteFence.namespaces,
						cacheWriteFence.fenceTokens[userId],
					),
				),
			),
		);
	})
	.as("global");
