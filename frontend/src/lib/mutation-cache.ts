import type { MutationMeta, QueryClient } from "@tanstack/react-query";
import { activeCurrency } from "./currency-context";
import {
	type CacheIdentity,
	type CacheOperation,
	cacheOperationDomains,
	getCurrentCacheIdentity,
	queryKeys,
} from "./query-cache";
import { type ApiTag, type auxiliaryQueryTags, cacheDomainTags } from "./query-tags";
import { refreshQueries } from "./refresh-queries";

const auxiliaryOperations = {
	adminUser: ["admin-users"],
	history: ["admin-history-coverage", "admin-history-completion"],
	institution: [
		"institution-profile-history",
		"institutions",
		"institution-review",
		"admin-institution-catalog",
		"admin-institution-card-profiles",
		"merge-profiles",
		"merge-history",
		"institution-notifications",
	],
	openFinance: ["open-finance"],
	tax: ["tax-definitions"],
} as const satisfies Record<string, readonly (keyof typeof auxiliaryQueryTags)[]>;
type MutationOperation = CacheOperation | keyof typeof auxiliaryOperations;
function isDomainOperation(operation: MutationOperation): operation is CacheOperation {
	return Object.hasOwn(cacheOperationDomains, operation);
}
export interface CacheMutationMeta extends Record<string, unknown> {
	cacheOperations?: readonly MutationOperation[];
	awaitRefetch?: boolean;
}

declare module "@tanstack/react-query" {
	interface Register {
		mutationMeta: CacheMutationMeta;
	}
}

export const mutationCacheMeta = (...cacheOperations: MutationOperation[]): MutationMeta => ({
	cacheOperations,
});

function queryCurrency(key: readonly unknown[]): string | undefined {
	const hasCurrency = key[2] === "dashboard" || (key[2] === "budgets" && key[3] === "summary");
	return hasCurrency && typeof key[4] === "string" ? key[4] : undefined;
}

/** Install once per client. Success runs after the mutation's persisted work resolves. */
export function configureMutationInvalidation(
	client: QueryClient,
	context: {
		identity: () => CacheIdentity | null;
		currency: () => string;
	} = { currency: activeCurrency, identity: getCurrentCacheIdentity },
): void {
	const cache = client.getMutationCache();
	const starts = new WeakMap<object, { identity: CacheIdentity | null; currency: string }>();
	const previous = cache.config;
	cache.config = {
		...previous,
		onMutate: async (variables, mutation, mutationContext) => {
			starts.set(mutation, { currency: context.currency(), identity: context.identity() });
			await previous.onMutate?.(variables, mutation, mutationContext);
		},
		onSuccess: async (data, variables, result, mutation, mutationContext) => {
			await previous.onSuccess?.(data, variables, result, mutation, mutationContext);
			const start = starts.get(mutation);
			if (start) await invalidateMutationCache(client, start, mutation.meta, context.identity);
		},
	};
}

export interface CacheMutationStart {
	identity: CacheIdentity | null;
	currency: string;
}

export const captureCacheMutation = (): CacheMutationStart => ({
	currency: activeCurrency(),
	identity: getCurrentCacheIdentity(),
});

/** Shared completion policy for React mutations and persisted background actions. */
export async function invalidateMutationCache(
	client: QueryClient,
	start: CacheMutationStart,
	meta?: CacheMutationMeta,
	identity: () => CacheIdentity | null = getCurrentCacheIdentity,
): Promise<void> {
	if (!start.identity || start.identity !== identity() || !meta?.cacheOperations?.length) return;
	const owner = start.identity;
	const domains = new Set(
		meta.cacheOperations
			.filter(isDomainOperation)
			.flatMap(operation => [...cacheOperationDomains[operation]]),
	);
	const roots = [...domains].map(domain => queryKeys[domain].all(owner));
	const tags = new Set<ApiTag>([...domains].flatMap(domain => [...cacheDomainTags[domain]]));
	const auxiliaryRoots = meta.cacheOperations.flatMap(operation =>
		Object.hasOwn(auxiliaryOperations, operation)
			? [...auxiliaryOperations[operation as keyof typeof auxiliaryOperations]]
			: [],
	);
	const pending = refreshQueries(client, {
		predicate: query => {
			const currency = query.meta?.cacheCurrency ?? queryCurrency(query.queryKey);
			const relatedTag = !query.meta?.apiTags || query.meta.apiTags.some(tag => tags.has(tag));
			const auxiliary = auxiliaryRoots.some(root => {
				const publicCatalog = root === "tax-definitions" && query.queryKey.length === 1;
				return (
					(publicCatalog || query.meta?.cacheIdentity === owner) &&
					(query.queryKey[0] === root ||
						(query.queryKey[0] === "identity" &&
							query.queryKey[1] === owner &&
							query.queryKey[2] === root))
				);
			});
			return (
				auxiliary ||
				(relatedTag &&
					(!currency || currency === start.currency) &&
					roots.some(root => root.every((value, index) => query.queryKey[index] === value)))
			);
		},
		refetchType: "active",
	});
	if (meta.awaitRefetch) await pending;
	else void pending.catch(() => undefined);
}
