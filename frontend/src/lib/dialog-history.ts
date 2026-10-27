import type { RouterHistory } from "@tanstack/react-router";
import { type DialogUrl, dialogUrls, isRestorableDialog } from "./dialog-url";

const stateKey = "zaimuDialogStack";
interface DialogState {
	zaimuDialogStack?: string[];
}

function stack(history: RouterHistory) {
	return (history.location.state as DialogState)[stateKey] ?? [];
}

/** One history entry per dialog, shared by nested and sibling dialogs. */
export function createDialogHistory(history: RouterHistory, preserveScroll?: () => void) {
	let previousHref = history.location.href;
	let updatingDialogUrl = false;
	const dialogs = new Map<string, { close: () => void; href: string; version: number }>();

	history.subscribe(({ action }) => {
		if (updatingDialogUrl) return;
		if (new URL(previousHref, "http://localhost").pathname === history.location.pathname)
			preserveScroll?.();
		previousHref = history.location.href;
		const current = stack(history);
		for (const [id, dialog] of dialogs) {
			if (
				new URL(dialog.href, "http://localhost").pathname !== history.location.pathname ||
				!current.includes(id)
			) {
				dialogs.delete(id);
				dialog.close();
			} else {
				dialog.href = history.location.href;
			}
		}
		// Closed dialogs must not leave dead steps when traversing page history.
		if (
			current.length &&
			!dialogs.has(current.at(-1)!) &&
			!isRestorableDialog(current.at(-1)!, history.location.href)
		) {
			if (action.type === "BACK" || (action.type === "GO" && action.index < 0)) history.back();
			else if (action.type === "FORWARD" || (action.type === "GO" && action.index > 0))
				history.forward();
		}
	});

	return {
		depth: (id: string) => stack(history).indexOf(id) + 1,
		dismissTopmost() {
			const id = stack(history).at(-1);
			const dialog = id ? dialogs.get(id) : undefined;
			if (!dialog) return false;
			dialog.close();
			return true;
		},
		isTopmost: (id: string) => stack(history).at(-1) === id,
		release(id: string) {
			const dialog = dialogs.get(id);
			if (!dialog) return;
			const version = ++dialog.version;
			// React StrictMode immediately retains again during its effect replay.
			queueMicrotask(() => {
				if (dialogs.get(id) !== dialog || dialog.version !== version) return;
				dialogs.delete(id);
				if (dialog.href === history.location.href && stack(history).at(-1) === id) history.back();
			});
		},
		retain(id: string, close: () => void, url?: DialogUrl) {
			const existing = dialogs.get(id);
			if (existing) {
				existing.version++;
				existing.close = close;
				return;
			}
			history.flush();
			const currentHref = history.location.href;
			const urls = url
				? dialogUrls(currentHref, url)
				: { background: currentHref, foreground: currentHref };
			// Stable URL-backed IDs survive reloads. Adopt their existing entry instead of pushing again.
			if (url && stack(history).includes(id)) {
				dialogs.set(id, { close, href: currentHref, version: 0 });
				return;
			}
			const parentStack = stack(history).filter(
				value => dialogs.has(value) || isRestorableDialog(value, currentHref),
			);
			preserveScroll?.();
			updatingDialogUrl = true;
			try {
				if (url && urls.background !== currentHref) {
					history.replace(urls.background, { ...history.location.state, [stateKey]: parentStack });
					history.flush();
				}
				dialogs.set(id, { close, href: urls.foreground, version: 0 });
				history.push(urls.foreground, {
					...history.location.state,
					[stateKey]: [...parentStack, id],
				});
				history.flush();
				previousHref = history.location.href;
			} finally {
				updatingDialogUrl = false;
			}
		},
	};
}

const histories = new WeakMap<RouterHistory, ReturnType<typeof createDialogHistory>>();

export function getDialogHistory(history: RouterHistory, preserveScroll?: () => void) {
	let dialogs = histories.get(history);
	if (!dialogs) {
		dialogs = createDialogHistory(history, preserveScroll);
		histories.set(history, dialogs);
	}
	return dialogs;
}
