import { getReferenceRatesAverages, type GetReferenceRatesAveragesResponse } from "./api";

export type ReferenceRateAverages = GetReferenceRatesAveragesResponse;
const cacheKey = "zaimu:reference-rate-averages:v1";

export function cachedReferenceRateAverages(): ReferenceRateAverages | null {
	try {
		const value = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
		if (!value || typeof value.startDate !== "string" || typeof value.endDate !== "string") return null;
		if (
			typeof value.ready !== "boolean" ||
			!value.averages ||
			(value.ready && (!Number.isFinite(value.averages.CDI) || !Number.isFinite(value.averages.SELIC)))
		)
			return null;
		return value;
	} catch {
		return null;
	}
}

export async function refreshReferenceRateAverages(): Promise<ReferenceRateAverages | null> {
	try {
		const value = await getReferenceRatesAverages({
			...{
				authenticated: false,
				signal: AbortSignal.timeout(10_000),
			},
		}).then(result => result.data);
		if (
			typeof value.ready !== "boolean" ||
			!value.averages ||
			(value.ready && (!Number.isFinite(value.averages.CDI) || !Number.isFinite(value.averages.SELIC)))
		)
			return cachedReferenceRateAverages();
		try {
			localStorage.setItem(cacheKey, JSON.stringify(value));
		} catch {
			/* Storage may be unavailable. */
		}
		return value;
	} catch {
		return cachedReferenceRateAverages();
	}
}
