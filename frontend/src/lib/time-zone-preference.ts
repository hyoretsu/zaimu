import { countryTimeZone, isTimeZone, resolveTimeZone } from "@zaimu/finance/time-zone";
import { useAuthStore } from "@/stores/auth";
import { getTimeZonePreferences, patchTimeZonePreferences } from "./api";
import { localMeta } from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";

export const timeZonePreferenceKey = (owner: string | null) => ["time-zone-preference", owner];

export async function readTimeZonePreference() {
	const owner = getCurrentCacheIdentity();
	if (!owner) throw new Error("Sessão indisponível");
	if (!useAuthStore.getState().isGuestMode && navigator.onLine) {
		const result = await getTimeZonePreferences();
		await Promise.all([
			localMeta.set("time-zone-preference", result.preferredTimeZone, owner),
			localMeta.set("country-preference", result.preferredCountry, owner),
		]);
		return result;
	}
	const [country, preference] = await Promise.all([
		localMeta.get("country-preference", owner),
		localMeta.get("time-zone-preference", owner),
	]);
	const preferredCountry = typeof country === "string" ? country : null;
	const preferredTimeZone = typeof preference === "string" ? preference : null;
	return {
		defaultTimeZone: countryTimeZone(preferredCountry),
		preferredCountry,
		preferredTimeZone,
		timeZone: resolveTimeZone(preferredTimeZone, preferredCountry),
	};
}

export async function saveTimeZonePreference(preferredTimeZone: string | null) {
	const owner = getCurrentCacheIdentity();
	if (!owner) throw new Error("Sessão indisponível");
	if (preferredTimeZone !== null && !isTimeZone(preferredTimeZone))
		throw new Error("Fuso horário inválido");
	if (!useAuthStore.getState().isGuestMode) {
		const result = await patchTimeZonePreferences({ preferredTimeZone });
		await localMeta.set("time-zone-preference", result.preferredTimeZone, owner);
		await localMeta.set("country-preference", result.preferredCountry, owner);
		return result;
	}
	await localMeta.set("time-zone-preference", preferredTimeZone, owner);
	return readTimeZonePreference();
}
