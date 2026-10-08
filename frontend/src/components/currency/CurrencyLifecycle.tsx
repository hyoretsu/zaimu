import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useCacheIdentity } from "@/lib/query-cache";
import { useCurrencyStore } from "@/stores/currency";
export function CurrencyLifecycle() {
	const owner = useCacheIdentity();
	const queryClient = useQueryClient();
	const currency = useCurrencyStore(state => state.currency);
	const previous = useRef(currency);
	useEffect(() => {
		if (!owner) return;
		void useCurrencyStore.getState().refresh();
		const onVisible = () => {
			if (document.visibilityState === "visible") void useCurrencyStore.getState().refreshLocation();
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onVisible);
		};
	}, [owner]);
	useEffect(() => {
		if (previous.current === currency) return;
		previous.current = currency;
		if (owner) void queryClient.invalidateQueries({ queryKey: ["identity", owner, "dashboard"] });
	}, [currency, owner, queryClient]);
	return null;
}
