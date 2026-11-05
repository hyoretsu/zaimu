import type { ZodType } from "zod";
import {
	getFinancialHistoryCollectionsById,
	getFinancialHistoryCollectionsByIdEstimate,
	getFinancialHistoryCollectionsByIdEstimateResponseSchema,
	getFinancialHistoryCollectionsByIdResponseSchema,
	getFinancialHistoryRate,
	getFinancialHistoryRateResponseSchema,
	postFinancialHistoryCollections,
	postFinancialHistoryCollectionsByIdRetry,
	postFinancialHistoryCollectionsByIdRetryResponseSchema,
	postFinancialHistoryCollectionsResponseSchema,
} from "./api";
import { SessionChangedError } from "./api/client-api";
import { localMeta } from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";

export type HistoryCollection = NonNullable<import("./api").GetFinancialHistoryCollectionsByIdResponse>;
export type HistoryProgress = HistoryCollection["progress"];
export type CurrencyHistoryEstimate = import("./api").GetFinancialHistoryCollectionsByIdEstimateResponse;
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
	kind: import("./api").PostFinancialHistoryCollectionsBody["kind"],
	series: string[],
	referenceDate?: string,
) => {
	const data = { kind, referenceDate, series: [...new Set(series)].sort() };
	return historyValue(
		`financial-history:/collections:${JSON.stringify(data)}`,
		() => postFinancialHistoryCollections({ body: data, ...historyConfig() }).then(result => result.data),
		postFinancialHistoryCollectionsResponseSchema,
		true,
	);
};
export const readHistoryCollection = (id: string) =>
	historyValue(
		`financial-history:/collections/${encodeURIComponent(id)}:`,
		() =>
			getFinancialHistoryCollectionsById({ path: { id }, ...historyConfig() }).then(
				result => result.data,
			),
		getFinancialHistoryCollectionsByIdResponseSchema,
	);
export const retryHistoryCollection = (id: string) =>
	historyValue(
		`financial-history:/collections/${encodeURIComponent(id)}/retry:`,
		() =>
			postFinancialHistoryCollectionsByIdRetry({ path: { id }, ...historyConfig() }).then(
				result => result.data,
			),
		postFinancialHistoryCollectionsByIdRetryResponseSchema,
		true,
	);
export const readCurrencyEstimate = (id: string, currency: string) =>
	historyValue(
		`financial-history:/collections/${encodeURIComponent(id)}/estimate?currency=${encodeURIComponent(currency)}:`,
		() =>
			getFinancialHistoryCollectionsByIdEstimate({
				path: { id },
				query: { currency },
				...historyConfig(),
			}).then(result => result.data),
		getFinancialHistoryCollectionsByIdEstimateResponseSchema,
	);
export const readCurrencyRate = (date: string, from: string, to: string) => {
	const params = { date: date.slice(0, 10), from: from.toUpperCase(), to: to.toUpperCase() };
	return historyValue(
		`financial-history:/rate?date=${encodeURIComponent(params.date)}&from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}:`,
		() => getFinancialHistoryRate({ query: params, ...historyConfig() }).then(result => result.data),
		getFinancialHistoryRateResponseSchema,
	);
};
