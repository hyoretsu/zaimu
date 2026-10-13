import { toast } from "sonner";
import { create } from "zustand";
import { getCurrentCacheIdentity } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth";

export interface ModalRecovery<T = unknown> {
	entityId?: string;
	kind: string;
	payload: T;
}

interface RecoveryEntry extends ModalRecovery {
	id: string;
	identity: string;
	path: string;
}

interface RecoveryState {
	entries: Record<string, RecoveryEntry>;
	pending: Record<string, true>;
	requestedId: string | null;
	clear: (id: string) => void;
	clearAll: () => void;
	request: (id: string) => void;
	store: (entry: RecoveryEntry) => void;
	setPending: (key: string, pending: boolean) => void;
}

export const useModalRecoveryStore = create<RecoveryState>(set => ({
	clear: id =>
		set(state => {
			const entries = { ...state.entries };
			delete entries[id];
			return { entries, requestedId: state.requestedId === id ? null : state.requestedId };
		}),
	clearAll: () => set({ entries: {}, requestedId: null }),
	entries: {},
	pending: {},
	request: id => set({ requestedId: id }),
	requestedId: null,
	setPending: (key, pending) =>
		set(state => {
			const next = { ...state.pending };
			if (pending) next[key] = true;
			else delete next[key];
			return { pending: next };
		}),
	store: entry => set(state => ({ entries: { ...state.entries, [entry.id]: entry } })),
}));

let navigateToRecovery: ((path: string) => Promise<unknown>) | null = null;

export function configureModalRecoveryNavigation(navigate: (path: string) => Promise<unknown>) {
	navigateToRecovery = navigate;
}

export function requestModalRecovery(id: string) {
	const entry = useModalRecoveryStore.getState().entries[id];
	if (!entry || entry.identity !== getCurrentCacheIdentity()) return;
	const request = () => {
		if (useModalRecoveryStore.getState().entries[id]?.identity === getCurrentCacheIdentity())
			useModalRecoveryStore.getState().request(id);
	};
	if (window.location.pathname + window.location.search !== entry.path) {
		void navigateToRecovery?.(entry.path).then(request);
	} else request();
}

export function takeModalRecovery<T>(kind: string): (ModalRecovery<T> & { id: string }) | null {
	const state = useModalRecoveryStore.getState();
	const id = state.requestedId;
	const entry = id ? state.entries[id] : undefined;
	if (!entry || entry.kind !== kind || entry.identity !== getCurrentCacheIdentity()) return null;
	if (entry.path !== window.location.pathname + window.location.search) return null;
	state.clear(id!);
	return { entityId: entry.entityId, id: entry.id, kind: entry.kind, payload: entry.payload as T };
}

useAuthStore.subscribe((state, previous) => {
	const identity =
		state.isAuthenticated && state.user
			? `user:${state.user.id}`
			: state.isGuestMode
				? `guest:${state.guestId}`
				: null;
	const previousIdentity =
		previous.isAuthenticated && previous.user
			? `user:${previous.user.id}`
			: previous.isGuestMode
				? `guest:${previous.guestId}`
				: null;
	if (identity !== previousIdentity) useModalRecoveryStore.getState().clearAll();
});

export interface BackgroundModalAction<T> {
	close: () => void;
	conflictKey?: string;
	conflictKeys?: string[];
	failureMessage: string;
	loadingMessage: string;
	progress?: "toast" | "record";
	onSuccess?: (result: T) => Promise<unknown> | unknown;
	recovery: ModalRecovery;
	recoveryId?: string;
	run: () => Promise<T>;
	successMessage: string;
}

export function runBackgroundModalAction<T>({
	close,
	conflictKey,
	conflictKeys = [],
	failureMessage,
	loadingMessage,
	onSuccess,
	progress = "toast",
	recovery,
	recoveryId,
	run,
	successMessage,
}: BackgroundModalAction<T>): void {
	const identity = getCurrentCacheIdentity();
	const pendingKeys = [...new Set([...(conflictKey ? [conflictKey] : []), ...conflictKeys])].map(
		key => `${identity}:${key}`,
	);
	if (pendingKeys.some(key => useModalRecoveryStore.getState().pending[key])) return;
	const setPending = (active: boolean) =>
		useModalRecoveryStore.setState(state => {
			const pending = { ...state.pending };
			for (const key of pendingKeys) {
				if (active) pending[key] = true;
				else delete pending[key];
			}
			return { pending };
		});
	setPending(true);
	const path = window.location.pathname + window.location.search;
	close();
	const toastId =
		progress === "toast" ? toast.loading(loadingMessage, { position: "bottom-right" }) : undefined;
	const retryRefresh = async (result: T) => {
		try {
			await onSuccess?.(result);
			toast.success("Lista atualizada.", { position: "bottom-right" });
		} catch {
			toast.error("Não foi possível atualizar a lista.", {
				action: { label: "Tentar atualizar", onClick: () => void retryRefresh(result) },
				position: "bottom-right",
			});
		}
	};
	void Promise.resolve()
		.then(run)
		.then(async result => {
			useModalRecoveryStore.setState(state => ({
				entries: Object.fromEntries(
					Object.entries(state.entries).filter(
						([id, entry]) =>
							id !== recoveryId &&
							(recovery.entityId === undefined ||
								entry.identity !== identity ||
								entry.kind !== recovery.kind ||
								entry.entityId !== recovery.entityId),
					),
				),
			}));
			toast.success(successMessage, { id: toastId, position: "bottom-right" });
			try {
				await onSuccess?.(result);
			} catch {
				toast.error("Dados salvos. Não foi possível atualizar a lista.", {
					action: { label: "Tentar atualizar", onClick: () => void retryRefresh(result) },
					position: "bottom-right",
				});
			}
		})
		.catch(error => {
			const id = crypto.randomUUID();
			const canRecover = identity !== null && identity === getCurrentCacheIdentity();
			if (canRecover) {
				if (recoveryId) useModalRecoveryStore.getState().clear(recoveryId);
				useModalRecoveryStore.getState().store({ ...recovery, id, identity, path });
			}
			toast.error(error instanceof Error ? error.message : failureMessage, {
				action: canRecover ? { label: "Reabrir", onClick: () => requestModalRecovery(id) } : undefined,
				id: toastId,
				position: "bottom-right",
			});
		})
		.finally(() => {
			setPending(false);
		});
}
