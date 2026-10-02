import type { CacheNamespace } from "~/shared/infra/cache";
import type { EventEnvelope } from "./events";

export const paymentCardNamespaces = (cardIds: unknown): CacheNamespace[] => {
	if (!Array.isArray(cardIds)) return [];
	const ids = cardIds.filter(
		(id): id is string => typeof id === "string" && id.length > 0 && id.length <= 36,
	);
	return ids.length
		? ["credit-cards:overview", ...ids.map(id => `credit-cards:${id}:statements` as const)]
		: [];
};

type NamespaceResolver = (event: EventEnvelope) => CacheNamespace[];

export const syncCacheNamespaces: CacheNamespace[] = [
	"accounts:detail",
	"accounts:list",
	"accounts:rate-history",
	"accounts:yields",
	"categories:detail",
	"categories:list",
	"credit-cards:overview",
	"credit-cards:statements",
	"dashboard",
	"debts:events",
	"debts:invitations",
	"debts:overview",
	"imports:pending",
	"imports:detail",
	"loans:detail",
	"loans:history",
	"loans:installments",
	"loans:list",
	"schedules:detail",
	"schedules:history",
	"schedules:overview",
	"stores:list",
	"transactions:list",
	"transactions:detail",
];

const detail =
	(prefix: "imports:detail" | "transactions:detail"): NamespaceResolver =>
	event => [`${prefix}:${event.aggregateId}`];

export const cacheInvalidationMatrix: Record<string, NamespaceResolver> = {
	account: () => [
		"accounts:detail",
		"accounts:list",
		"accounts:rate-history",
		"accounts:yields",
		"dashboard",
		"transactions:list",
	],
	category: () => [
		"categories:detail",
		"categories:list",
		"dashboard",
		"schedules:overview",
		"transactions:list",
	],
	creditCard: event => [
		"accounts:detail",
		"accounts:list",
		"credit-cards:overview",
		`credit-cards:${event.aggregateId}:statements`,
		"debts:events",
		"debts:overview",
		"dashboard",
		"transactions:list",
	],
	creditCardImport: event => [
		"accounts:detail",
		"accounts:list",
		"credit-cards:overview",
		"credit-cards:statements",
		"debts:events",
		"debts:overview",
		"dashboard",
		"transactions:list",
		"imports:pending",
		...detail("imports:detail")(event),
	],
	debt: () => ["debts:events", "debts:invitations", "debts:overview", "dashboard", "transactions:list"],
	financialAccount: () => [
		"credit-cards:overview",
		"credit-cards:statements",
		"accounts:detail",
		"accounts:list",
		"accounts:rate-history",
		"accounts:yields",
		"dashboard",
		"transactions:list",
	],
	loan: () => [
		"dashboard",
		"loans:detail",
		"loans:history",
		"loans:installments",
		"loans:list",
		"transactions:list",
	],
	referenceRate: () => [
		"accounts:detail",
		"accounts:list",
		"accounts:rate-history",
		"accounts:yields",
		"dashboard",
		"transactions:list",
	],
	schedule: () => [
		"credit-cards:statements",
		"debts:events",
		"debts:overview",
		"accounts:detail",
		"accounts:list",
		"credit-cards:overview",
		"dashboard",
		"schedules:detail",
		"schedules:history",
		"schedules:overview",
		"transactions:list",
	],
	store: () => ["stores:list", "transactions:list"],
	sync: event => {
		const payload = event.payload as { domain?: string; aggregateIds?: string[] } | null;
		const domain = payload?.domain;
		if (!domain || domain === "sync" || !cacheInvalidationMatrix[domain]) return syncCacheNamespaces;
		return [
			...new Set([
				...cacheInvalidationMatrix[domain](event),
				...(domain === "transaction"
					? ["credit-cards:overview" as const, "credit-cards:statements" as const]
					: []),
				...(payload?.aggregateIds ?? []).flatMap(aggregateId =>
					cacheInvalidationMatrix[domain]({ ...event, aggregateId }),
				),
			]),
		];
	},
	transaction: event => [
		...paymentCardNamespaces(
			(event.payload as { paymentCreditCardIds?: unknown } | null)?.paymentCreditCardIds,
		),
		"accounts:detail",
		"accounts:list",
		"dashboard",
		"debts:events",
		"debts:overview",
		"transactions:list",
		...detail("transactions:detail")(event),
	],
	transactionImport: event => [
		"accounts:detail",
		"accounts:list",
		"debts:events",
		"debts:overview",
		"dashboard",
		"transactions:list",
		"imports:pending",
		...detail("imports:detail")(event),
	],
};

export const namespacesForEvent = (event: EventEnvelope) => {
	const namespaces = cacheInvalidationMatrix[event.aggregateType]?.(event) ?? [];
	return [
		...new Set<CacheNamespace>([
			...namespaces,
			...(event.aggregateType !== "transaction" && namespaces.includes("transactions:list")
				? ["transactions:detail" as const]
				: []),
		]),
	];
};
