import type { CacheNamespace } from "~/shared/infra/cache";
import type { EventEnvelope } from "./events";

type NamespaceResolver = (event: EventEnvelope) => CacheNamespace[];

const detail =
	(prefix: "imports:detail" | "transactions:detail"): NamespaceResolver =>
	event => [`${prefix}:${event.aggregateId}`];

export const cacheInvalidationMatrix: Record<string, NamespaceResolver> = {
	account: () => ["accounts:list", "dashboard", "transactions:list"],
	category: () => ["dashboard", "transactions:list"],
	creditCard: event => ["credit-cards:overview", `credit-cards:${event.aggregateId}:statements`, "dashboard"],
	creditCardImport: event => ["imports:pending", ...detail("imports:detail")(event)],
	debt: () => ["dashboard", "transactions:list"],
	financialAccount: () => ["accounts:list", "dashboard", "transactions:list"],
	loan: () => ["dashboard", "transactions:list"],
	referenceRate: () => ["accounts:list", "dashboard", "transactions:list"],
	schedule: () => ["accounts:list", "credit-cards:overview", "dashboard", "transactions:list"],
	sync: () => ["accounts:list", "credit-cards:overview", "dashboard", "imports:pending", "transactions:list"],
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
