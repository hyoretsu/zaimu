import { toast } from "./toast";

const message = "Recalculando rendimentos...";
const doneMessage = "Rendimentos recalculados";
const doneDurationMs = 2500;

/** Tracks accounts whose yields are being recalculated and keeps one loading toast while any remain. */
export function createYieldRecalculationToast() {
	const pending = new Set<string>();
	let toastId: string | number | undefined;
	const hide = () => {
		const id = toastId;
		toastId = undefined;
		if (id !== undefined) toast.dismiss(id);
	};
	return {
		dispose() {
			pending.clear();
			hide();
		},
		finish(accountId: string | undefined) {
			if (!accountId || !pending.delete(accountId) || pending.size > 0) return;
			hide();
			toast.success(doneMessage, { duration: doneDurationMs });
		},
		start(accountId: string | undefined) {
			if (!accountId) return;
			pending.add(accountId);
			// A dismissed or evicted toast forgets its id, so the next recalculation can show a new one.
			toastId ??= toast.loading(message, {
				dedupeKey: "yield-recalculation",
				onAutoClose: () => {
					toastId = undefined;
				},
				onDismiss: () => {
					toastId = undefined;
				},
			});
		},
	};
}
