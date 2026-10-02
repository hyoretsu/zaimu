import Elysia from "elysia";
import { requireUserId } from "~/modules/auth";
import { namespacesForEvent, paymentCardNamespaces } from "~/shared/application/cache-invalidation";
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

export const writeNamespaces = (pathname: string): CacheNamespace[] => {
	const { aggregateId, aggregateType } = aggregateForPath(pathname);
	const namespaces = namespacesForEvent(
		createEventEnvelope({
			aggregateId: aggregateId ?? "all",
			aggregateType,
			correlationId: "cache-write",
			eventType: "updated",
			payload: {},
			userIds: [],
		}),
	);
	if (!aggregateId && (aggregateType === "creditCardImport" || aggregateType === "transactionImport"))
		namespaces.push("imports:detail");
	if (aggregateType === "transaction" && (!aggregateId || pathname.includes("/transfer-suggestions/")))
		namespaces.push("transactions:detail");
	return [...new Set(namespaces)];
};

const aggregateForPath = (pathname: string) => {
	const [root, id] = pathname.split("/").filter(Boolean);
	const aggregateType =
		(
			{
				"balance-adjustments": "financialAccount",
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
	.derive(async ({ request, body }) => {
		const pathname = new URL(request.url).pathname;
		if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return { cacheWriteFence: null };
		const namespaces = writeNamespaces(pathname);
		if (namespaces.length === 0) return { cacheWriteFence: null };
		const userId = await requireUserId(request);
		const paymentCreditCardIds: string[] = [];
		if (pathname.startsWith("/transactions")) {
			const cardId =
				body && typeof body === "object" && "paymentCreditCardId" in body
					? body.paymentCreditCardId
					: undefined;
			if (typeof cardId === "string") paymentCreditCardIds.push(cardId);
			const transactionId = pathname.match(/^\/transactions\/([^/]+)$/)?.[1];
			if (transactionId && ["PATCH", "DELETE"].includes(request.method)) {
				const rows = await queryRaw<{ paymentCreditCardId: string | null }>(
					'SELECT "paymentCreditCardId" FROM "Transaction" WHERE "id"=$1 AND "userId"=$2',
					[transactionId, userId],
				);
				for (const row of rows)
					if (row.paymentCreditCardId) paymentCreditCardIds.push(row.paymentCreditCardId);
			}
			namespaces.push(...paymentCardNamespaces(paymentCreditCardIds));
		}

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
		return {
			cacheWriteFence: {
				fenceTokens,
				namespaces: [...new Set(namespaces)],
				pathname,
				paymentCreditCardIds,
				userId,
				userIds,
			},
		};
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
					payload: {
						method: request.method,
						pathname: cacheWriteFence.pathname,
						paymentCreditCardIds: cacheWriteFence.paymentCreditCardIds,
					},
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
