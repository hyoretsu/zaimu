import { useRouter } from "@tanstack/react-router";
import { useCallback, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";

export function useRouteDismissableOpen({
	open,
	defaultOpen = false,
	onOpenChange,
}: {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const router = useRouter({ warn: false });
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const changeOpen = useCallback(
		(nextOpen: boolean) => {
			setInternalOpen(nextOpen);
			onOpenChange?.(nextOpen);
		},
		[onOpenChange],
	);
	const isOpen = open ?? internalOpen;

	useLayoutEffect(() => {
		if (!router || !isOpen) return;
		const pathname = router.state.location.pathname;
		return router.subscribe("onBeforeNavigate", ({ toLocation }) => {
			if (toLocation.pathname === pathname) return;
			// Remove portals before Activity hides the screen and suspends its effects.
			flushSync(() => changeOpen(false));
		});
	}, [router, isOpen, changeOpen]);

	return { onOpenChange: changeOpen, open: isOpen };
}
