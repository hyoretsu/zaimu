import { useRouter } from "@tanstack/react-router";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
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
	const urlValue = readViewState(href, key, fallback, schema, fields);
	// Optimistic value shown immediately; the URL write is deferred so the toggle paints before routing runs.
	const [pending, setPending] = useState<{ baseHref: string; value: T } | null>(null);
	const value = pending && pending.baseHref === href ? pending.value : urlValue;
	const valueRef = useRef(value);
	valueRef.current = value;
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const setValue: Dispatch<SetStateAction<T>> = useCallback(
		update => {
			// Hidden mobile tabs must never write their state onto another screen.
			if (router.history.location.pathname !== pathname) return;
			const next =
				typeof update === "function" ? (update as (previous: T) => T)(valueRef.current) : update;
			valueRef.current = next;
			setPending({ baseHref: lastHref.current, value: next });
			clearTimeout(timer.current);
			timer.current = setTimeout(() => {
				if (router.history.location.pathname !== pathname) return;
				router.history.flush();
				const currentHref = router.history.location.href;
				const nextHref = writeViewState(currentHref, key, valueRef.current, fallback, fields);
				if (nextHref === currentHref) {
					setPending(null);
					return;
				}
				// Once the URL holds the value the optimistic copy must go, or navigating back to the old href would revive it.
				void router
					.navigate({
						href: nextHref,
						replace: true,
						resetScroll: false,
						state: previous => previous,
					})
					.finally(() => setPending(null));
			}, 0);
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
	const set = useMemo(() => new Set(items), [items.join("\u0000")]);
	return [set, setValue] as const;
}
