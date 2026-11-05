import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { usesTwelveHourClock } from "@/lib/time-mask";

/** Locale of the app UI, used inside webviews whose own locale does not follow the system. */
const APP_LOCALE = "pt-BR";

let twelveHour = usesTwelveHourClock(isTauri() ? APP_LOCALE : undefined);
const listeners = new Set<() => void>();

/**
 * Mobile builds ask the OS for its 12/24-hour toggle: the webview ignores it and `Intl` only reflects its locale.
 * Other targets keep the locale-based answer.
 */
if (isTauri()) {
	invoke<{ twentyFourHour: boolean | null }>("plugin:push|clock")
		.then(({ twentyFourHour }) => {
			if (twentyFourHour === null || twentyFourHour === !twelveHour) return;
			twelveHour = !twentyFourHour;
			for (const listener of listeners) listener();
		})
		.catch(() => {});
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Whether the device displays times as `hh:mm AM/PM` instead of 24-hour `HH:MM`. */
export function useTwelveHourClock() {
	return useSyncExternalStore(subscribe, () => twelveHour);
}
