import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { type AuthState, useAuthStore } from "@/stores/auth";

export type CacheIdentity = `guest:${string}` | `user:${string}`;

export function getCacheIdentity(
	state: Pick<AuthState, "guestId" | "isAuthenticated" | "isGuestMode" | "user">,
): CacheIdentity | null {
	if (state.isAuthenticated && state.user) return `user:${state.user.id}`;
	if (state.isGuestMode) return `guest:${state.guestId}`;
	return null;
}

export function getCurrentCacheIdentity(): CacheIdentity | null {
	return getCacheIdentity(useAuthStore.getState());
}

export function useCacheIdentity(): CacheIdentity | null {
	return useAuthStore(getCacheIdentity);
}

const domainKey = (identity: CacheIdentity, domain: string) => ["identity", identity, domain] as const;

export const queryKeys = {
	accounts: {
		all: (identity: CacheIdentity) => domainKey(identity, "accounts"),
		list: (identity: CacheIdentity) => [...domainKey(identity, "accounts"), "list"] as const,
	},
	accountYieldHolidays: {
		all: (identity: CacheIdentity) => domainKey(identity, "account-yield-holidays"),
	},
	accountYields: {
		all: (identity: CacheIdentity) => domainKey(identity, "account-yields"),
		list: (identity: CacheIdentity, accountId: string) =>
			[...domainKey(identity, "account-yields"), "list", accountId] as const,
	},
	categories: {
		all: (identity: CacheIdentity) => domainKey(identity, "categories"),
		list: (identity: CacheIdentity) => [...domainKey(identity, "categories"), "list"] as const,
	},
	creditCardImports: {
		all: (identity: CacheIdentity) => domainKey(identity, "credit-card-imports"),
		detail: (identity: CacheIdentity, importId: string | null) =>
			[...domainKey(identity, "credit-card-imports"), "detail", importId] as const,
		pending: (identity: CacheIdentity) => [...domainKey(identity, "credit-card-imports"), "pending"] as const,
	},
	creditCardStatements: {
		all: (identity: CacheIdentity) => domainKey(identity, "credit-card-statements"),
		detail: (identity: CacheIdentity, cardId: string, statementId: string) =>
			[...domainKey(identity, "credit-card-statements"), "detail", cardId, statementId] as const,
		list: (identity: CacheIdentity, cardId: string, filters: { isPaid?: boolean } = {}) =>
			[...domainKey(identity, "credit-card-statements"), "list", cardId, filters] as const,
		payable: (identity: CacheIdentity, currentStatementId?: string) =>
			[...domainKey(identity, "credit-card-statements"), "payable", currentStatementId ?? null] as const,
	},
	creditCards: {
		all: (identity: CacheIdentity) => domainKey(identity, "credit-cards"),
		book: (identity: CacheIdentity, cardId: string) =>
			[...domainKey(identity, "credit-cards"), "book", cardId] as const,
		list: (identity: CacheIdentity) => [...domainKey(identity, "credit-cards"), "list"] as const,
		refundReviews: (identity: CacheIdentity, cardId: string) =>
			[...domainKey(identity, "credit-cards"), "refund-reviews", cardId] as const,
	},
	dashboard: {
		all: (identity: CacheIdentity) => domainKey(identity, "dashboard"),
		comparison: (identity: CacheIdentity, parameters: unknown) =>
			[...domainKey(identity, "dashboard"), "comparison", parameters] as const,
		detail: (identity: CacheIdentity, parameters: unknown) =>
			[...domainKey(identity, "dashboard"), "detail", parameters] as const,
	},
	debts: {
		all: (identity: CacheIdentity) => domainKey(identity, "debts"),
		events: (identity: CacheIdentity, personId: string) =>
			[...domainKey(identity, "debts"), "events", personId] as const,
		invitations: (identity: CacheIdentity) => [...domainKey(identity, "debts"), "invitations"] as const,
		ledger: (identity: CacheIdentity) => [...domainKey(identity, "debts"), "ledger"] as const,
	},
	loans: {
		all: (identity: CacheIdentity) => domainKey(identity, "loans"),
		earlyPayoff: (identity: CacheIdentity, loanId: string | null, advanceType: string) =>
			[...domainKey(identity, "loans"), "early-payoff", loanId, advanceType] as const,
		list: (identity: CacheIdentity) => [...domainKey(identity, "loans"), "list"] as const,
	},
	recurring: {
		all: (identity: CacheIdentity) => domainKey(identity, "recurring"),
		payments: (identity: CacheIdentity) => [...domainKey(identity, "recurring"), "payments"] as const,
		salaries: (identity: CacheIdentity) => [...domainKey(identity, "recurring"), "salaries"] as const,
		subscriptions: (identity: CacheIdentity) =>
			[...domainKey(identity, "recurring"), "subscriptions"] as const,
	},
	stores: {
		all: (identity: CacheIdentity) => domainKey(identity, "stores"),
		list: (identity: CacheIdentity) => [...domainKey(identity, "stores"), "list"] as const,
	},
	transactionImports: {
		all: (identity: CacheIdentity) => domainKey(identity, "transaction-imports"),
		detail: (identity: CacheIdentity, importId: string | null) =>
			[...domainKey(identity, "transaction-imports"), "detail", importId] as const,
		pending: (identity: CacheIdentity) => [...domainKey(identity, "transaction-imports"), "pending"] as const,
	},
	transactions: {
		all: (identity: CacheIdentity) => domainKey(identity, "transactions"),
		byAccount: (identity: CacheIdentity, accountId: string) =>
			[...domainKey(identity, "transactions"), "account", accountId] as const,
		list: (identity: CacheIdentity, filters: unknown = {}) =>
			[...domainKey(identity, "transactions"), "list", filters] as const,
	},
} as const;

type CacheDomain = keyof typeof queryKeys;

export const cacheOperationDomains = {
	account: ["accounts", "creditCards", "dashboard", "transactions", "accountYields"],
	category: ["categories", "transactions", "dashboard"],
	creditCard: ["creditCards", "creditCardStatements", "accounts", "dashboard"],
	debt: ["debts", "dashboard", "transactions"],
	holiday: ["accountYieldHolidays", "accountYields", "accounts", "dashboard", "transactions"],
	institution: ["accounts", "creditCards", "dashboard"],
	invitation: ["debts"],
	loan: ["loans", "accounts", "dashboard", "transactions"],
	recurring: [
		"recurring",
		"accounts",
		"creditCards",
		"creditCardStatements",
		"dashboard",
		"transactions",
		"debts",
		"accountYields",
	],
	statement: ["creditCardStatements", "creditCards", "accounts", "dashboard", "debts", "transactions"],
	store: ["stores", "transactions", "dashboard"],
	transaction: ["transactions", "accounts", "creditCardStatements", "dashboard", "debts", "accountYields"],
	yield: ["accountYields", "accounts", "dashboard", "transactions"],
} as const satisfies Record<string, readonly CacheDomain[]>;

export type CacheOperation = keyof typeof cacheOperationDomains;

export async function invalidateCacheOperation(
	queryClient: QueryClient,
	identity: CacheIdentity,
	operation: CacheOperation,
): Promise<void> {
	await Promise.all(
		cacheOperationDomains[operation].map(domain =>
			queryClient.invalidateQueries({ queryKey: queryKeys[domain].all(identity), refetchType: "active" }),
		),
	);
}

export async function invalidateQueryKeys(
	queryClient: QueryClient,
	keys: readonly QueryKey[],
): Promise<void> {
	await Promise.all(keys.map(queryKey => queryClient.invalidateQueries({ queryKey, refetchType: "active" })));
}

export async function closeImportReview(
	queryClient: QueryClient,
	identity: CacheIdentity,
	type: "credit-card" | "transaction",
	importId: string,
): Promise<void> {
	const keys = type === "transaction" ? queryKeys.transactionImports : queryKeys.creditCardImports;
	queryClient.removeQueries({ exact: true, queryKey: keys.detail(identity, importId) });
	await queryClient.invalidateQueries({ queryKey: keys.pending(identity), refetchType: "active" });
}
