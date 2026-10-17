import type { QueryClient } from "@tanstack/react-query";
import {
	getAdminUsersQueryKey,
	getBalanceAdjustmentsQueryKey,
	getCategoriesQueryKey,
	getCreditCardImportsQueryKey,
	getCreditCardsByIdStatementsQueryKey,
	getCreditCardsQueryKey,
	getDashboardQueryKey,
	getDebtsQueryKey,
	getFinancialAccountsQueryKey,
	getFinancialAccountYieldHolidaysQueryKey,
	getFinancialAccountYieldsQueryKey,
	getFinancialHistoryAdminCoverageQueryKey,
	getFinancialInstitutionsQueryKey,
	getLoansQueryKey,
	getMonthlyBudgetsQueryKey,
	getOpenFinanceQueryKey,
	getRecurringQueryKey,
	getStoresQueryKey,
	getTaxDefinitionsQueryKey,
	getTransactionImportsQueryKey,
	getTransactionsQueryKey,
} from "./api";
import { type CacheIdentity, getCurrentCacheIdentity, queryKeys } from "./query-cache";

type CacheDomain = keyof typeof queryKeys;
export const cacheDomainTags = {
	accounts: [getFinancialAccountsQueryKey()[0]],
	accountYieldHolidays: [getFinancialAccountYieldHolidaysQueryKey()[0]],
	accountYields: [getFinancialAccountYieldsQueryKey()[0]],
	balanceAdjustments: [getBalanceAdjustmentsQueryKey()[0]],
	budgets: [getMonthlyBudgetsQueryKey()[0]],
	categories: [getCategoriesQueryKey()[0]],
	creditCardImports: [getCreditCardImportsQueryKey()[0]],
	creditCardStatements: [getCreditCardsByIdStatementsQueryKey(undefined)[0]],
	creditCards: [getCreditCardsQueryKey()[0]],
	dashboard: [getDashboardQueryKey()[0]],
	debts: [getDebtsQueryKey()[0]],
	loans: [getLoansQueryKey()[0]],
	recurring: [getRecurringQueryKey()[0]],
	stores: [getStoresQueryKey()[0]],
	transactionImports: [getTransactionImportsQueryKey()[0]],
	transactions: [getTransactionsQueryKey()[0]],
} as const satisfies Record<CacheDomain, readonly string[]>;
export const auxiliaryQueryTags = {
	"admin-history-completion": getFinancialHistoryAdminCoverageQueryKey()[0],
	"admin-history-coverage": getFinancialHistoryAdminCoverageQueryKey()[0],
	"admin-institution-card-profiles": getFinancialInstitutionsQueryKey()[0],
	"admin-institution-catalog": getFinancialInstitutionsQueryKey()[0],
	"admin-users": getAdminUsersQueryKey({ email: "" })[0],
	"institution-notifications": getFinancialInstitutionsQueryKey()[0],
	"institution-profile-history": getFinancialInstitutionsQueryKey()[0],
	"institution-review": getFinancialInstitutionsQueryKey()[0],
	institutions: getFinancialInstitutionsQueryKey()[0],
	"merge-history": getFinancialInstitutionsQueryKey()[0],
	"merge-profiles": getFinancialInstitutionsQueryKey()[0],
	"open-finance": getOpenFinanceQueryKey()[0],
	"tax-definitions": getTaxDefinitionsQueryKey()[0],
} as const;
export type ApiTag =
	| (typeof cacheDomainTags)[CacheDomain][number]
	| (typeof auxiliaryQueryTags)[keyof typeof auxiliaryQueryTags];

export interface CacheQueryMeta extends Record<string, unknown> {
	apiTags?: readonly ApiTag[];
	cacheIdentity?: CacheIdentity;
	cacheCurrency?: string;
}
declare module "@tanstack/react-query" {
	interface Register {
		queryMeta: CacheQueryMeta;
	}
}

/** Attach generated tags without changing identity, currency, filter or pagination keys. */
export function configureQueryTags(client: QueryClient): () => void {
	const owners = new WeakMap<object, CacheIdentity>();
	return client.getQueryCache().subscribe(event => {
		if (event.type === "removed") return;
		const query = event.query;
		const key = query.queryKey;
		const auxiliaryRoot = key[0] === "identity" ? key[2] : key[0];
		if (typeof auxiliaryRoot === "string" && Object.hasOwn(auxiliaryQueryTags, auxiliaryRoot)) {
			const owner =
				owners.get(query) ??
				query.meta?.cacheIdentity ??
				(key[0] === "identity" && typeof key[1] === "string" && isCacheIdentity(key[1])
					? key[1]
					: getCurrentCacheIdentity());
			if (owner) owners.set(query, owner);
			if (owner)
				query.setOptions({
					...query.options,
					meta: {
						...query.meta,
						apiTags: [auxiliaryQueryTags[auxiliaryRoot as keyof typeof auxiliaryQueryTags]],
						cacheIdentity: owner,
					},
				});
			return;
		}
		if (key[0] !== "identity" || typeof key[1] !== "string") return;
		const identity = key[1];
		if (!isCacheIdentity(identity)) return;
		for (const domain of Object.keys(cacheDomainTags) as CacheDomain[]) {
			// The identity value is validated above; use the existing root to preserve its dimensions.
			const root = queryKeys[domain].all(identity);
			if (!root.every((part, index) => key[index] === part)) continue;
			query.setOptions({
				...query.options,
				meta: { ...query.meta, apiTags: cacheDomainTags[domain], cacheIdentity: identity },
			});
			break;
		}
	});
}

function isCacheIdentity(value: string): value is CacheIdentity {
	return value.startsWith("user:") || value.startsWith("guest:");
}
