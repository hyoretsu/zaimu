import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { getCurrentCacheIdentity } from "@/lib/query-cache";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/auth";
import { completeModalActionGroup } from "./modal-action-completion";
import { captureCacheMutation, invalidateMutationCache } from "./mutation-cache";
import type { CacheOperation } from "./query-cache";

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

let sessionVersion = 0;
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
	if (identity !== previousIdentity) {
		sessionVersion++;
		useModalRecoveryStore.getState().clearAll();
	}
});

export interface BackgroundModalAction<T> {
	completionGroup?: string;
	onFailureRefresh?: () => Promise<unknown>;
	cache?: { client: QueryClient; operations: readonly CacheOperation[] };
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
	cache,
	completionGroup,
	onFailureRefresh,
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
	const cacheStart = captureCacheMutation();
	const identity = getCurrentCacheIdentity();
	const version = sessionVersion;
	const isCurrent = () => getCurrentCacheIdentity() === identity && version === sessionVersion;
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
	const toastId = progress === "toast" ? toast.loading(loadingMessage) : undefined;
	const retryRefresh = async (result: T) => {
		if (!isCurrent()) return;
		try {
			if (cache)
				await invalidateMutationCache(cache.client, cacheStart, {
					awaitRefetch: true,
					cacheOperations: cache.operations,
				});
			if (isCurrent()) await onSuccess?.(result);
			toast.success("Lista atualizada.");
		} catch {
			toast.error("Não foi possível atualizar a lista.", {
				action: { label: "Tentar atualizar", onClick: () => void retryRefresh(result) },
			});
		}
	};
	void Promise.resolve()
		.then(run)
		.then(async result => {
			if (!isCurrent()) return;
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
			if (completionGroup) {
				await completeModalActionGroup(`${identity}:${completionGroup}`, {
					current: isCurrent,
					message: successMessage,
					refresh: async () => {
						if (cache)
							await invalidateMutationCache(cache.client, cacheStart, {
								awaitRefetch: true,
								cacheOperations: cache.operations,
							});
						if (isCurrent()) await onSuccess?.(result);
					},
					success: true,
				});
				return;
			}
			toast.success(successMessage, { id: toastId, position: "bottom-right" });
			try {
				if (cache)
					await invalidateMutationCache(cache.client, cacheStart, {
						awaitRefetch: true,
						cacheOperations: cache.operations,
					});
				if (isCurrent()) await onSuccess?.(result);
			} catch {
				toast.error("Dados salvos. Não foi possível atualizar a lista.", {
					action: { label: "Tentar atualizar", onClick: () => void retryRefresh(result) },
				});
			}
		})
		.catch(async error => {
			if (!isCurrent()) return;
			const id = crypto.randomUUID();
			const canRecover = identity !== null && isCurrent();
			if (canRecover) {
				if (recoveryId) useModalRecoveryStore.getState().clear(recoveryId);
				useModalRecoveryStore.getState().store({ ...recovery, id, identity, path });
			}
			if (completionGroup) {
				await completeModalActionGroup(`${identity}:${completionGroup}`, {
					current: isCurrent,
					errorOptions: {
						action: canRecover
							? { label: "Reabrir", onClick: () => requestModalRecovery(id) }
							: undefined,
						dedupeKey: `modal:${recovery.kind}:${failureMessage}`,
					},
					message: error instanceof Error ? error.message : failureMessage,
					refresh: onFailureRefresh,
					success: false,
				});
				return;
			}
			toast.error(error instanceof Error ? error.message : failureMessage, {
				action: canRecover
					? { label: "Reabrir", onClick: () => requestModalRecovery(id) }
					: undefined,
				dedupeKey: `modal:${recovery.kind}:${failureMessage}`,
				id: toastId,
			});
		})
		.finally(() => {
			setPending(false);
		});
}
