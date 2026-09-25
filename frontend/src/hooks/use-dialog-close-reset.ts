import { useEffect, useRef } from "react";

// DialogContent's exit animation lasts 100 ms. Keep form values visible until it finishes.
export function useDialogCloseReset(open: boolean, reset: () => void) {
	const wasOpen = useRef(open);
	const resetRef = useRef(reset);
	resetRef.current = reset;

	useEffect(() => {
		const shouldReset = wasOpen.current && !open;
		wasOpen.current = open;
		if (!shouldReset) return;

		const timeout = window.setTimeout(() => resetRef.current(), 150);
		return () => window.clearTimeout(timeout);
	}, [open]);
}
