import type { ZodType } from "zod";
import {
	getFinancialHistoryCollectionsById,
	getFinancialHistoryCollectionsByIdEstimate,
	getFinancialHistoryCollectionsByIdEstimateQueryResponseSchema,
	getFinancialHistoryCollectionsByIdQueryResponseSchema,
	getFinancialHistoryRate,
	getFinancialHistoryRateQueryResponseSchema,
	postFinancialHistoryCollections,
	postFinancialHistoryCollectionsByIdRetry,
	postFinancialHistoryCollectionsByIdRetryMutationResponseSchema,
	postFinancialHistoryCollectionsMutationResponseSchema,
} from "./api";
import { SessionChangedError } from "./api/client-api";
import { localMeta } from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";

export type HistoryCollection = NonNullable<import("./api").GetFinancialHistoryCollectionsByIdQueryResponse>;
export type HistoryProgress = HistoryCollection["progress"];
export type CurrencyHistoryEstimate = import("./api").GetFinancialHistoryCollectionsByIdEstimateQueryResponse;
async function historyValue<T>(
	key: string,
	load: () => Promise<T>,
	schema: ZodType<T>,
	mutation = false,
): Promise<T | null> {
	const owner = getCurrentCacheIdentity();
	if (!owner) return null;
	try {
		if (!navigator.onLine) throw new Error("Sem conexão");
		const value = await load();
		if (getCurrentCacheIdentity() !== owner) throw new SessionChangedError();
		await localMeta.set(key, value, owner);
		return value;
	} catch (error) {
		if (getCurrentCacheIdentity() !== owner) throw new SessionChangedError();
		const cached = schema.safeParse(await localMeta.get(key, owner));
		if (cached.success) return cached.data;
		if (mutation) throw error;
		return null;
	}
}

const historyConfig = () => ({ authenticated: false, signal: AbortSignal.timeout(15_000) });

export const requestHistoryCollection = (
	kind: import("./api").PostFinancialHistoryCollectionsMutationRequest["kind"],
	series: string[],
	referenceDate?: string,
) => {
	const data = { kind, referenceDate, series: [...new Set(series)].sort() };
	return historyValue(
		`financial-history:/collections:${JSON.stringify(data)}`,
		() => postFinancialHistoryCollections(data, historyConfig()),
		postFinancialHistoryCollectionsMutationResponseSchema,
		true,
	);
};
export const readHistoryCollection = (id: string) =>
	historyValue(
		`financial-history:/collections/${encodeURIComponent(id)}:`,
		() => getFinancialHistoryCollectionsById(id, historyConfig()),
		getFinancialHistoryCollectionsByIdQueryResponseSchema,
	);
export const retryHistoryCollection = (id: string) =>
	historyValue(
		`financial-history:/collections/${encodeURIComponent(id)}/retry:`,
		() => postFinancialHistoryCollectionsByIdRetry(id, historyConfig()),
		postFinancialHistoryCollectionsByIdRetryMutationResponseSchema,
		true,
	);
export const readCurrencyEstimate = (id: string, currency: string) =>
	historyValue(
		`financial-history:/collections/${encodeURIComponent(id)}/estimate?currency=${encodeURIComponent(currency)}:`,
		() => getFinancialHistoryCollectionsByIdEstimate(id, { currency }, historyConfig()),
		getFinancialHistoryCollectionsByIdEstimateQueryResponseSchema,
	);
export const readCurrencyRate = (date: string, from: string, to: string) => {
	const params = { date: date.slice(0, 10), from: from.toUpperCase(), to: to.toUpperCase() };
	return historyValue(
		`financial-history:/rate?date=${encodeURIComponent(params.date)}&from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}:`,
		() => getFinancialHistoryRate(params, historyConfig()),
		getFinancialHistoryRateQueryResponseSchema,
	);
};
