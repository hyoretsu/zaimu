import { toast } from "./toast";

const message = "Recalculando rendimentos...";
// Safety net for a lost `yieldRecalculated` push: the toast must never outlive the operation forever.
const maxWaitMs = 60_000;

/** Tracks accounts whose yields are being recalculated and keeps one loading toast while any remain. */
export function createYieldRecalculationToast() {
	const pending = new Set<string>();
	let toastId: string | number | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const stop = () => {
		clearTimeout(timer);
		timer = undefined;
		pending.clear();
		if (toastId !== undefined) toast.dismiss(toastId);
		toastId = undefined;
	};
	return {
		dispose: stop,
		finish(accountId: string | undefined) {
			if (accountId) pending.delete(accountId);
			if (pending.size === 0) stop();
		},
		start(accountId: string | undefined) {
			if (!accountId) return;
			pending.add(accountId);
			toastId ??= toast.loading(message, { dedupeKey: "yield-recalculation" });
			clearTimeout(timer);
			timer = setTimeout(stop, maxWaitMs);
		},
	};
}
