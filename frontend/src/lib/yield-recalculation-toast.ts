import { toast } from "./toast";

const message = "Recalculando rendimentos...";
// Safety net for a lost `yieldRecalculated` push: the toast must never outlive the operation forever.
const maxWaitMs = 60_000;
// Small accounts recalculate in milliseconds; without a floor the toast would flash unseen.
const minVisibleMs = 1_500;

/** Tracks accounts whose yields are being recalculated and keeps one loading toast while any remain. */
export function createYieldRecalculationToast() {
	const pending = new Set<string>();
	let toastId: string | number | undefined;
	let shownAt = 0;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let release: ReturnType<typeof setTimeout> | undefined;
	const dismiss = () => {
		clearTimeout(timeout);
		clearTimeout(release);
		timeout = release = undefined;
		pending.clear();
		if (toastId !== undefined) toast.dismiss(toastId);
		toastId = undefined;
	};
	return {
		dispose: dismiss,
		finish(accountId: string | undefined) {
			if (accountId) pending.delete(accountId);
			if (pending.size > 0 || toastId === undefined) return;
			clearTimeout(release);
			release = setTimeout(dismiss, Math.max(0, minVisibleMs - (Date.now() - shownAt)));
		},
		start(accountId: string | undefined) {
			if (!accountId) return;
			pending.add(accountId);
			clearTimeout(release);
			release = undefined;
			if (toastId === undefined) {
				toastId = toast.loading(message, { dedupeKey: "yield-recalculation" });
				shownAt = Date.now();
			}
			clearTimeout(timeout);
			timeout = setTimeout(dismiss, maxWaitMs);
		},
	};
}
