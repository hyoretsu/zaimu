import { useCallback, useSyncExternalStore } from "react";

function getMediaQueryList(query: string) {
	return window.matchMedia(query);
}

export function useMediaQuery(query: string) {
	const subscribe = useCallback(
		(callback: () => void) => {
			const mediaQuery = getMediaQueryList(query);
			mediaQuery.addEventListener("change", callback);
			return () => mediaQuery.removeEventListener("change", callback);
		},
		[query],
	);
	const getSnapshot = useCallback(() => getMediaQueryList(query).matches, [query]);

	return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
