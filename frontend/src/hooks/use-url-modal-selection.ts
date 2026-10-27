import { useRouter } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { dialogUrls } from "@/lib/dialog-url";
import { viewNullableId } from "@/lib/view-state";
import { useUrlViewState } from "./use-url-view-state";

const noParameters: string[] = [];

/** Clear modal identity and its dependent view parameters in one URL replacement. */
export function useUrlModalSelection(parameter: string, clear: string[] = noParameters) {
	const router = useRouter();
	const [pathname] = useState(() => router.history.location.pathname);
	const [selected, setSelected] = useUrlViewState<string | null>(parameter, null, viewNullableId);
	const change = useCallback(
		(value: string | null) => {
			if (value !== null) {
				setSelected(value);
				return;
			}
			if (router.history.location.pathname !== pathname) return;
			const current = router.history.location.href;
			const { background } = dialogUrls(current, { clear, parameter, value: "" });
			if (background !== current)
				void router.navigate({
					href: background,
					replace: true,
					resetScroll: false,
					state: previous => previous,
				});
		},
		[clear, parameter, pathname, router, setSelected],
	);
	return [selected, change] as const;
}
