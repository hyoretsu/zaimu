import { type CurrencyLocation, effectiveCurrency } from "@zaimu/finance/currency-preference";
import { create } from "zustand";
import { detectCurrencyLocation } from "@/lib/currency-location";
import { fetchWithAuth } from "@/lib/dataService";
import { localMeta } from "@/lib/localStorage";
import { getCurrentCacheIdentity } from "@/lib/query-cache";
import { useAuthStore } from "./auth";

const provisionalCurrencies = Intl.supportedValuesOf("currency").filter(
	currency => !currency.startsWith("X") || ["XAF", "XCD", "XCG", "XOF", "XPF"].includes(currency),
);
interface CurrencyState {
	owner: string | null;
	preferredCurrency: string | null;
	location: CurrencyLocation | null;
	currency: string;
	currencies: string[];
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	refreshLocation: () => Promise<void>;
	setPreference: (currency: string | null) => Promise<void>;
}
let pending: Promise<void> | undefined;
const resolved = (preferred: string | null, location: CurrencyLocation | null, currencies: string[]) =>
	effectiveCurrency(preferred, location, navigator.languages, currencies);
export const useCurrencyStore = create<CurrencyState>((set, get) => ({
	currencies: provisionalCurrencies,
	currency: "USD",
	error: null,
	loading: true,
	location: null,
	owner: null,
	preferredCurrency: null,
	refresh: async () => {
		const owner = getCurrentCacheIdentity();
		if (!owner) return;
		if (pending && get().owner === owner) return pending;
		set({
			currency: resolved(null, null, get().currencies),
			error: null,
			loading: true,
			location: null,
			owner,
			preferredCurrency: null,
		});
		const operation = (async () => {
			try {
				const cached = (await localMeta.get("currency-preference", owner)) as
					| { preferredCurrency: string | null }
					| undefined;
				const catalogPromise = (async () => {
					let currencies =
						((await localMeta.get("currency-catalog", owner)) as string[] | undefined) ?? get().currencies;
					const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:3333").replace(/\/$/, "");
					try {
						const response = await fetch(`${apiUrl}/financial-history/currencies`, {
							signal: AbortSignal.timeout(10_000),
						});
						const value: unknown = response.ok ? await response.json() : null;
						if (
							Array.isArray(value) &&
							value.includes("USD") &&
							value.every(code => typeof code === "string" && /^[A-Z]{3}$/.test(code))
						) {
							currencies = value;
							await localMeta.set("currency-catalog", currencies, owner);
						}
					} catch {
						/* Retain cached supported currencies offline. */
					}
					return currencies;
				})();
				const preferencePromise = (async () => {
					if (!useAuthStore.getState().isAuthenticated) return cached?.preferredCurrency ?? null;
					try {
						const value = await fetchWithAuth<{ preferredCurrency: string | null }>("/currency-preferences/");
						await localMeta.set("currency-preference", value, owner);
						return value.preferredCurrency;
					} catch {
						return cached?.preferredCurrency ?? null;
					}
				})();
				const [currencies, preferred] = await Promise.all([catalogPromise, preferencePromise]);
				const location = await detectCurrencyLocation(currencies);
				if (getCurrentCacheIdentity() === owner)
					set({
						currencies,
						currency: resolved(preferred, location, currencies),
						loading: false,
						location,
						preferredCurrency: preferred,
					});
			} catch (error) {
				if (getCurrentCacheIdentity() === owner)
					set({ error: error instanceof Error ? error.message : "Preferência indisponível", loading: false });
			}
		})().finally(() => {
			if (pending === operation) pending = undefined;
		});
		pending = operation;
		return operation;
	},
	refreshLocation: async () => {
		const owner = getCurrentCacheIdentity();
		if (!owner || owner !== get().owner) return;
		const location = await detectCurrencyLocation(get().currencies);
		if (location && getCurrentCacheIdentity() === owner)
			set({ currency: resolved(get().preferredCurrency, location, get().currencies), location });
	},
	setPreference: async preferredCurrency => {
		const owner = getCurrentCacheIdentity();
		if (!owner || owner !== get().owner) throw new Error("Preferências ainda carregando");
		if (preferredCurrency && !get().currencies.includes(preferredCurrency))
			throw new Error("Moeda não suportada");
		if (useAuthStore.getState().isAuthenticated)
			await fetchWithAuth("/currency-preferences/", {
				body: JSON.stringify({ preferredCurrency }),
				method: "PATCH",
			});
		await localMeta.set("currency-preference", { preferredCurrency }, owner);
		if (getCurrentCacheIdentity() === owner)
			set({ currency: resolved(preferredCurrency, get().location, get().currencies), preferredCurrency });
	},
}));
