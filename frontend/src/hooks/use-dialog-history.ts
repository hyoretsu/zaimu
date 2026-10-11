import { useRouter } from "@tanstack/react-router";
import { useId, useLayoutEffect, useRef } from "react";
import { getDialogHistory } from "@/lib/dialog-history";

export function useDialogHistory(open: boolean, onOpenChange: (open: boolean) => void) {
	const router = useRouter({ warn: false });
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
}
