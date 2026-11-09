import { useTimeFormatStore } from "@/stores/time-format";

/** Whether times are entered as `hh:mm AM/PM` (the default) instead of 24-hour `HH:MM`, per the user's setting. */
export function useTwelveHourClock() {
	return useTimeFormatStore(state => state.timeFormat === "12h");
}
