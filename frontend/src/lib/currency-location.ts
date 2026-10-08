import {
	type CurrencyLocation,
	countryCurrency,
	validCurrencyLocation,
} from "@zaimu/finance/currency-preference";

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
		try {
			const response = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(10_000) });
			if (!response.ok) return null;
			const payload = (await response.json()) as { country_code?: unknown };
			if (typeof payload.country_code !== "string" || !/^[A-Z]{2}$/.test(payload.country_code)) return null;
			const currency = countryCurrency(payload.country_code, supported);
			if (!currency) return null;
			const location = { country: payload.country_code, currency, detectedAt: Date.now() };
			try {
				localStorage.setItem(cacheKey, JSON.stringify(location));
			} catch {
				/* Detection works without storage. */
			}
			return location;
		} catch {
			return null;
		}
	})().finally(() => {
		pending = undefined;
	});
	return pending;
}
