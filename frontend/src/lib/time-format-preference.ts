import { useAuthStore } from "@/stores/auth";
import { getTimeFormatPreferences, patchTimeFormatPreferences } from "./api";
import { localMeta } from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";

export type TimeFormat = "12h" | "24h";

export const DEFAULT_TIME_FORMAT: TimeFormat = "12h";
export const timeFormatPreferenceKey = (owner: string | null) => ["time-format-preference", owner];

const asTimeFormat = (value: unknown): TimeFormat => (value === "24h" ? "24h" : DEFAULT_TIME_FORMAT);

export async function readTimeFormatPreference(): Promise<TimeFormat> {
	const owner = getCurrentCacheIdentity();
	if (!owner) throw new Error("Sessão indisponível");
	if (!useAuthStore.getState().isGuestMode && navigator.onLine) {
		try {
			const { timeFormat } = await getTimeFormatPreferences({}).then(result => result.data);
			await localMeta.set("time-format-preference", timeFormat, owner);
			return timeFormat;
		} catch {}
	}
	return asTimeFormat(await localMeta.get("time-format-preference", owner));
}

export async function saveTimeFormatPreference(timeFormat: TimeFormat) {
	const owner = getCurrentCacheIdentity();
	if (!owner) throw new Error("Sessão indisponível");
	if (!["12h", "24h"].includes(timeFormat)) throw new Error("Formato de horário inválido");
	if (!useAuthStore.getState().isGuestMode)
		await patchTimeFormatPreferences({ body: { timeFormat } }).then(result => result.data);
	await localMeta.set("time-format-preference", timeFormat, owner);
}
