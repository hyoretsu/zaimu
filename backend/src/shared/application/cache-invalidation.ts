import type { CacheNamespace } from "~/shared/infra/cache";
import type { EventEnvelope } from "./events";

type NamespaceResolver = (event: EventEnvelope) => CacheNamespace[];

export const syncCacheNamespaces: CacheNamespace[] = [
	"accounts:detail",
	"accounts:list",
	"accounts:rate-history",
	"accounts:yields",
	"categories:detail",
	"categories:list",
	"credit-cards:overview",
	"dashboard",
	"debts:events",
	"debts:invitations",
	"debts:overview",
	"imports:pending",
	"loans:detail",
	"loans:history",
	"loans:installments",
	"loans:list",
	"schedules:detail",
	"schedules:history",
	"schedules:overview",
	"stores:list",
	"transactions:list",
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
	creditCard: event => ["credit-cards:overview", `credit-cards:${event.aggregateId}:statements`, "dashboard"],
	creditCardImport: event => ["imports:pending", ...detail("imports:detail")(event)],
	debt: () => ["debts:events", "debts:invitations", "debts:overview", "dashboard", "transactions:list"],
	financialAccount: () => [
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
		"accounts:list",
		"credit-cards:overview",
		"dashboard",
		"schedules:detail",
		"schedules:history",
		"schedules:overview",
		"transactions:list",
	],
	store: () => ["stores:list", "transactions:list"],
	sync: () => syncCacheNamespaces,
	transaction: event => [
		"accounts:list",
		"dashboard",
		"transactions:list",
		...detail("transactions:detail")(event),
	],
	transactionImport: event => ["imports:pending", ...detail("imports:detail")(event)],
};

export const namespacesForEvent = (event: EventEnvelope) => [
	...new Set(cacheInvalidationMatrix[event.aggregateType]?.(event) ?? []),
];
