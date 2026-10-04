import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

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

	useEffect(() => {
		if (!router || !isOpen) return;
		return router.subscribe("onBeforeNavigate", ({ pathChanged }) => {
			if (pathChanged) changeOpen(false);
		});
	}, [router, isOpen, changeOpen]);

	return { onOpenChange: changeOpen, open: isOpen };
}
