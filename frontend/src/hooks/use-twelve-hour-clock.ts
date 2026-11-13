import { useQuery } from "@tanstack/react-query";
import { useCacheIdentity } from "@/lib/query-cache";
import { readTimeFormatPreference, timeFormatPreferenceKey } from "@/lib/time-format-preference";

/** Whether times are entered as `hh:mm AM/PM` (the default) instead of 24-hour `HH:MM`, per the account's setting. */
export function useTwelveHourClock() {
	const identity = useCacheIdentity();
	const { data } = useQuery({
		enabled: identity !== null,
		queryFn: readTimeFormatPreference,
		queryKey: timeFormatPreferenceKey(identity),
		staleTime: Number.POSITIVE_INFINITY,
	});
	return data !== "24h";
}
