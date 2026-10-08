import { localMeta } from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";

export interface HistoryProgress {
	state: "PENDING" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_GAPS" | "FAILED";
	requestedDays: number;
	coveredDays: number;
	total: number;
	completed: number;
	unavailable: number;
	failed: number;
	running: number;
	pending: number;
	canRetry: boolean;
	lastActivity: string | null;
}
export interface HistoryCollection {
	id: string;
	kind: "CURRENCY" | "INTEREST";
	startDate: string;
	endDate: string;
	series: string[];
	progress: HistoryProgress;
	units: {
		id: string;
		series: string;
		startDate: string;
		endDate: string;
		state: string;
		lastError: string | null;
	}[];
}
export interface CurrencyHistoryEstimate {
	collectionId: string;
	currency: string;
	method: "EXPONENTIAL_90_DAY_HALF_LIFE";
	startDate: string;
	endDate: string;
	progress: HistoryProgress;
	estimates: {
		baseCurrency: string;
		rate: number | null;
		samples: number;
		firstDate: string | null;
		lastDate: string | null;
	}[];
}
const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:3333").replace(/\/$/, "");

async function historyRequest<T>(path: string, options?: RequestInit): Promise<T | null> {
	// Capture the owner before network work, so a logout cannot move another owner's cache.
	const owner = getCurrentCacheIdentity();
	if (!owner) return null;
	const key = `financial-history:${path}:${options?.body ?? ""}`;
	try {
		if (!navigator.onLine) throw new Error("Sem conexão");
		const response = await fetch(`${apiUrl}/financial-history${path}`, {
			...options,
			headers: { "content-type": "application/json" },
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) throw new Error("Histórico indisponível");
		const value = (await response.json()) as T;
		await localMeta.set(key, value, owner);
		return value;
	} catch (error) {
		const cached = (await localMeta.get(key, owner)) as T | undefined;
		if (cached !== undefined) return cached;
		if (options?.method === "POST") throw error;
		return null;
	}
}

export const requestHistoryCollection = (
	kind: HistoryCollection["kind"],
	series: string[],
	referenceDate?: string,
) =>
	historyRequest<HistoryCollection>("/collections", {
		body: JSON.stringify({ kind, referenceDate, series: [...new Set(series)].sort() }),
		method: "POST",
	});
export const readHistoryCollection = (id: string) =>
	historyRequest<HistoryCollection>(`/collections/${encodeURIComponent(id)}`);
export const retryHistoryCollection = (id: string) =>
	historyRequest<HistoryCollection>(`/collections/${encodeURIComponent(id)}/retry`, { method: "POST" });
export const readCurrencyEstimate = (id: string, currency: string) =>
	historyRequest<CurrencyHistoryEstimate>(
		`/collections/${encodeURIComponent(id)}/estimate?currency=${encodeURIComponent(currency)}`,
	);
