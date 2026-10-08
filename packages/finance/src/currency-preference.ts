import { countryCurrencies } from "./country-currencies";

export interface CurrencyLocation {
	country: string;
	currency: string;
	detectedAt: number;
}
export const locationCacheMs = 7 * 24 * 60 * 60_000;

export function countryCurrency(country: string, supported: readonly string[]): string | null {
	const currency = countryCurrencies[country.toUpperCase()];
	return currency && supported.includes(currency) ? currency : null;
}
export function regionCurrency(language: string, supported: readonly string[]): string | null {
	try {
		const region = new Intl.Locale(language).region;
		return region ? countryCurrency(region, supported) : null;
	} catch {
		return null;
	}
}
export function effectiveCurrency(
	preferred: string | null,
	location: CurrencyLocation | null,
	languages: readonly string[],
	supported: readonly string[],
): string {
	if (preferred && supported.includes(preferred)) return preferred;
	if (location && supported.includes(location.currency)) return location.currency;
	for (const language of languages) {
		const currency = regionCurrency(language, supported);
		if (currency) return currency;
	}
	return "USD";
}
export function validCurrencyLocation(value: unknown, now = Date.now()): value is CurrencyLocation {
	if (!value || typeof value !== "object") return false;
	const location = value as CurrencyLocation;
	return (
		/^[A-Z]{2}$/.test(location.country) &&
		/^[A-Z]{3}$/.test(location.currency) &&
		Number.isFinite(location.detectedAt) &&
		location.detectedAt <= now &&
		now - location.detectedAt < locationCacheMs
	);
}
export function travelSuggestionKey(owner: string, preferred: string, location: CurrencyLocation): string {
	return `${owner}:${location.country}:${preferred}:${location.currency}`;
}
