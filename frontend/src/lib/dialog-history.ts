import type { RouterHistory } from "@tanstack/react-router";

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
	const dialogs = new Map<string, { close: () => void; href: string; version: number }>();

	history.subscribe(({ action }) => {
		if (previousHref === history.location.href) preserveScroll?.();
		previousHref = history.location.href;
		const current = stack(history);
		for (const [id, dialog] of dialogs) {
			if (dialog.href !== history.location.href || !current.includes(id)) {
				dialogs.delete(id);
				dialog.close();
			}
		}
		// Closed dialogs must not leave dead steps when traversing page history.
		if (current.length && !current.some(id => dialogs.has(id))) {
			if (action.type === "BACK" || (action.type === "GO" && action.index < 0)) history.back();
			else if (action.type === "FORWARD" || (action.type === "GO" && action.index > 0)) history.forward();
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
		retain(id: string, close: () => void) {
			const existing = dialogs.get(id);
			if (existing) {
				existing.version++;
				existing.close = close;
				return;
			}
			dialogs.set(id, { close, href: history.location.href, version: 0 });
			history.flush();
			history.push(history.location.href, {
				...history.location.state,
				[stateKey]: [...stack(history).filter(value => dialogs.has(value)), id],
			});
			history.flush();
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
