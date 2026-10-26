import { useRouter } from "@tanstack/react-router";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { z } from "zod";
import { readViewState, type ViewParameter, viewStringList, writeViewState } from "@/lib/view-state";

/** URL is the source of truth. Search-only navigation keeps the current screen mounted. */
export function useUrlViewState<T>(
	key: string,
	initial: T | (() => T),
	schema: z.ZodType<T>,
	fields?: readonly ViewParameter[],
) {
	const router = useRouter();
	const [fallback] = useState(initial);
	const [pathname] = useState(() => router.history.location.pathname);
	const lastHref = useRef(router.history.location.href);
	const href = useSyncExternalStore(
		useCallback(listener => router.history.subscribe(listener), [router]),
		() => {
			if (router.history.location.pathname === pathname)
				lastHref.current = router.history.location.href;
			return lastHref.current;
		},
	);
	const value = readViewState(href, key, fallback, schema, fields);
	const setValue: Dispatch<SetStateAction<T>> = useCallback(
		update => {
			// Hidden mobile tabs must never write their state onto another screen.
			if (router.history.location.pathname !== pathname) return;
			router.history.flush();
			const currentHref = router.history.location.href;
			const current = readViewState(currentHref, key, fallback, schema, fields);
			const next = typeof update === "function" ? (update as (previous: T) => T)(current) : update;
			const nextHref = writeViewState(currentHref, key, next, fallback, fields);
			if (nextHref === currentHref) return;
			void router.navigate({
				href: nextHref,
				replace: true,
				resetScroll: false,
				state: previous => previous,
			});
		},
		[fallback, fields, key, pathname, router, schema],
	);
	return [value, setValue] as const;
}

export function useUrlViewSet(key: string) {
	const [items, setItems] = useUrlViewState<string[]>(key, [], viewStringList);
	const setValue: Dispatch<SetStateAction<Set<string>>> = useCallback(
		update => {
			setItems(previous =>
				[...(typeof update === "function" ? update(new Set(previous)) : update)].sort(),
			);
		},
		[setItems],
	);
	return [new Set(items), setValue] as const;
}
