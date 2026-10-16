import { useRouter } from "@tanstack/react-router";
import { useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { getDialogHistory } from "@/lib/dialog-history";

export function useDialogHistory(open: boolean, onOpenChange: (open: boolean) => void) {
	const router = useRouter({ warn: false });
	if (router) {
		getDialogHistory(router.history, () => {
			const left = window.scrollX;
			const top = window.scrollY;
			const viewports = [...document.querySelectorAll<HTMLElement>('[data-slot="scroll-area-viewport"]')].map(
				element => ({ element, left: element.scrollLeft, top: element.scrollTop }),
			);
			const unsubscribe = router.subscribe("onRendered", () => {
				unsubscribe();
				window.scrollTo({ behavior: "instant", left, top });
				for (const viewport of viewports) {
					viewport.element.scrollLeft = viewport.left;
					viewport.element.scrollTop = viewport.top;
				}
			});
		});
	}
	const id = useId();
	const onChange = useRef(onOpenChange);
	useLayoutEffect(() => {
		onChange.current = onOpenChange;
	});
	useLayoutEffect(() => {
		if (!router || !open) return;
		const dialogs = getDialogHistory(router.history);
		dialogs.retain(id, () => onChange.current(false));
		return () => dialogs.release(id);
	}, [router, id, open]);
	const depth = useSyncExternalStore(
		listener => (router ? router.history.subscribe(listener) : () => {}),
		() => (router ? getDialogHistory(router.history).depth(id) : 0),
		() => 0,
	);
	return {
		depth,
		dismissTopmost: () => (router ? getDialogHistory(router.history).dismissTopmost() : false),
		isTopmost: () => !router || getDialogHistory(router.history).isTopmost(id),
	};
}
