import type { HistoryProgress } from "./financial-history";

const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:3333").replace(/\/$/, "");

export interface ReferenceRateAverages {
	collectionId?: string | null;
	progress?: HistoryProgress | null;
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
		const response = await fetch(`${apiUrl}/reference-rates/averages`, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) return cachedReferenceRateAverages();
		const value: ReferenceRateAverages = await response.json();
		if (
			typeof value.ready !== "boolean" ||
			!value.averages ||
			(value.ready && (!Number.isFinite(value.averages.CDI) || !Number.isFinite(value.averages.SELIC)))
		)
			return cachedReferenceRateAverages();
		if (!value.ready) value.averages = { CDI: null, SELIC: null };
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
