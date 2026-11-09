import { toast } from "./toast";

const message = "Recalculando rendimentos...";
// Safety net per account for a lost finish push: a pending account must never hold the toast forever.
const maxWaitMs = 60_000;

/** Tracks accounts whose yields are being recalculated and keeps one loading toast while any remain. */
export function createYieldRecalculationToast() {
	const pending = new Map<string, ReturnType<typeof setTimeout>>();
	let toastId: string | number | undefined;
	const hide = () => {
		const id = toastId;
		toastId = undefined;
		if (id !== undefined) toast.dismiss(id);
	};
	const settle = (accountId: string) => {
		clearTimeout(pending.get(accountId));
		pending.delete(accountId);
		if (pending.size === 0) hide();
	};
	return {
		dispose() {
			for (const timer of pending.values()) clearTimeout(timer);
			pending.clear();
			hide();
		},
		finish(accountId: string | undefined) {
			if (accountId) settle(accountId);
		},
		start(accountId: string | undefined) {
			if (!accountId) return;
			clearTimeout(pending.get(accountId));
			pending.set(
				accountId,
				setTimeout(() => settle(accountId), maxWaitMs),
			);
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
