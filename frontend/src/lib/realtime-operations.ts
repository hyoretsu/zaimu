import type { CacheMutationMeta } from "./mutation-cache";

export type CacheOperations = NonNullable<CacheMutationMeta["cacheOperations"]>;

const operationsByAggregate: Record<string, CacheOperations> = {
	account: ["account"],
	creditCard: ["creditCard"],
	creditCardImport: ["statement"],
	debt: ["debt"],
	financialAccount: ["account"],
	loan: ["loan"],
	referenceRate: ["account"],
	schedule: ["recurring"],
	transaction: ["transaction"],
};

export const realtimeCacheOperations = (aggregateType: string): CacheOperations =>
	operationsByAggregate[aggregateType] ?? [];
