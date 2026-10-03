import { apiUrl } from "./auth-client";

export interface ReferenceRateAverages {
	averages: { CDI: number | null; SELIC: number | null };
	endDate: string;
	ready: boolean;
	startDate: string;
}
const cacheKey = "zaimu:reference-rate-averages:v1";

export function cachedReferenceRateAverages(): ReferenceRateAverages | null {
	try {
		const value = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
		if (!value || typeof value.startDate !== "string" || typeof value.endDate !== "string") return null;
		if (!value.ready || !Number.isFinite(value.averages?.CDI) || !Number.isFinite(value.averages?.SELIC))
			return null;
		return value;
	} catch {
		return null;
	}
}

export async function refreshReferenceRateAverages(): Promise<ReferenceRateAverages | null> {
	try {
		const response = await fetch(`${apiUrl}/reference-rates/averages`, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) return cachedReferenceRateAverages();
		const value: ReferenceRateAverages = await response.json();
		if (!value.ready || !Number.isFinite(value.averages.CDI) || !Number.isFinite(value.averages.SELIC))
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
