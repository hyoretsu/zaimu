import { useAuthStore } from "@/stores/auth";
import { useCurrencyStore } from "@/stores/currency";
import { getCountryPreferences, patchCountryPreferences } from "./api";
import { countryCodes } from "./countries";
import { localMeta } from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";

export { countryCodes };
export function suggestedCountry(countries: string[], preference?: string | null) {
	return countries.length === 1
		? countries[0]
		: preference && countries.includes(preference)
			? preference
			: (preference ?? undefined);
}
export async function readCountryPreference() {
	const owner = getCurrentCacheIdentity();
	if (!owner) return null;
	const cached = (await localMeta.get("country-preference", owner)) as string | undefined;
	if (useAuthStore.getState().isGuestMode || !navigator.onLine) return cached ?? locationCountry();
	try {
		let value = (await getCountryPreferences()).preferredCountry;
		if (!value) {
			const suggestion = locationCountry();
			if (suggestion)
				value = (
					await patchCountryPreferences(
						{ preferredCountry: suggestion },
						{ headers: { "X-Country-Initialize": "true" } },
					)
				).preferredCountry;
		}
		if (value) await localMeta.set("country-preference", value, owner);
		return value;
	} catch {
		return cached ?? locationCountry();
	}
}
function locationCountry() {
	const location = useCurrencyStore.getState().location;
	if (location?.country && countryCodes.includes(location.country)) return location.country;
	for (const language of navigator.languages) {
		try {
			const region = new Intl.Locale(language).region;
			if (region && countryCodes.includes(region)) return region;
		} catch {}
	}
	return null;
}
export async function saveCountryPreference(preferredCountry: string) {
	const owner = getCurrentCacheIdentity();
	if (!owner) throw new Error("Sessão indisponível");
	if (!useAuthStore.getState().isGuestMode) await patchCountryPreferences({ preferredCountry });
	await localMeta.set("country-preference", preferredCountry, owner);
}
