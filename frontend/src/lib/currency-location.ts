import {
	type CurrencyLocation,
	countryCurrency,
	validCurrencyLocation,
} from "@zaimu/finance/currency-preference";

const providers = ["https://ipapi.co/json/", "https://ipwho.is/?fields=success,country_code"];

const cacheKey = "zaimu:device-currency-location:v1";
let pending: Promise<CurrencyLocation | null> | undefined;

export function cachedCurrencyLocation(): CurrencyLocation | null {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
		return validCurrencyLocation(value) ? value : null;
	} catch {
		return null;
	}
}
/** IP-only detection is device-scoped, deduplicated, and independent of explicit preference. */
export function detectCurrencyLocation(supported: readonly string[]): Promise<CurrencyLocation | null> {
	const cached = cachedCurrencyLocation();
	if (cached && supported.includes(cached.currency)) return Promise.resolve(cached);
	if (pending) return pending;
	pending = (async () => {
		for (const provider of providers) {
			try {
				const response = await fetch(provider, { signal: AbortSignal.timeout(10_000) });
				if (!response.ok) continue;
				const payload: unknown = await response.json();
				if (!payload || typeof payload !== "object" || !("country_code" in payload)) continue;
				if ("success" in payload && payload.success === false) continue;
				if (typeof payload.country_code !== "string" || !/^[A-Z]{2}$/.test(payload.country_code)) continue;
				const currency = countryCurrency(payload.country_code, supported);
				if (!currency) continue;
				const location = { country: payload.country_code, currency, detectedAt: Date.now() };
				try {
					localStorage.setItem(cacheKey, JSON.stringify(location));
				} catch {
					/* Detection works without storage. */
				}
				return location;
			} catch {
				/* A blocked, timed-out or invalid provider must not prevent fallback. */
			}
		}
		return null;
	})().finally(() => {
		pending = undefined;
	});
	return pending;
}
