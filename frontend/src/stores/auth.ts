import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";

export interface AuthUser {
	createdAt: Date;
	email: string;
	emailVerified: boolean;
	id: string;
	image?: null | string;
	name: string;
	updatedAt: Date;
}

export interface AuthState {
	clearError: () => void;
	enableGuestMode: () => void;
	error: null | string;
	guestId: string;
	initialize: () => Promise<void>;
	isAuthenticated: boolean;
	isGuestMode: boolean;
	isInitialized: boolean;
	isLoading: boolean;
	isRateLimited: boolean;
	isSessionUnavailable: boolean;
	login: (email: string, password: string) => Promise<boolean>;
	logout: () => Promise<void>;
	register: (name: string, email: string, password: string) => Promise<boolean>;
	user: AuthUser | null;
}

let initializing: Promise<void> | undefined;
let identityVersion = 0;

const generateGuestId = () => `guest_${crypto.randomUUID()}`;

export const useAuthStore = create<AuthState>()(
	persist(
		set => ({
			clearError: () => set({ error: null }),
			enableGuestMode: () => {
				identityVersion++;
				set({
					error: null,
					isAuthenticated: false,
					isGuestMode: true,
					isInitialized: true,
					isLoading: false,
					isRateLimited: false,
					isSessionUnavailable: false,
					user: null,
				});
			},
			error: null,
			guestId: generateGuestId(),
			initialize: () => {
				if (initializing) return initializing;
				const version = identityVersion;
				initializing = (async () => {
					set({ isLoading: true });
					try {
						let result = await authClient.getSession({ fetchOptions: { method: "POST" } });
						if (version !== identityVersion) return;
						if (
							result.error?.status === 503 ||
							result.error?.code === "METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED"
						) {
							result = await authClient.getSession({ fetchOptions: { method: "GET" } });
						}
						const { data, error } = result;
						if (version !== identityVersion) return;
						if (error && error.status !== 401 && error.status !== 403) {
							set({
								error: getAuthErrorMessage(error),
								isInitialized: true,
								isLoading: false,
								isRateLimited: error.status === 429,
								isSessionUnavailable: true,
							});
							return;
						}
						set({
							error: error ? getAuthErrorMessage(error) : null,
							isAuthenticated: Boolean(data?.user),
							isGuestMode: data?.user ? false : useAuthStore.getState().isGuestMode,
							isInitialized: true,
							isLoading: false,
							isRateLimited: false,
							isSessionUnavailable: false,
							user: (data?.user as AuthUser | undefined) ?? null,
						});
					} catch {
						if (version !== identityVersion) return;
						set({
							error: "Servidor indisponível. Tente novamente em instantes.",
							isInitialized: true,
							isLoading: false,
							isRateLimited: false,
							isSessionUnavailable: true,
						});
					}
				})().finally(() => {
					initializing = undefined;
				});
				return initializing;
			},
			isAuthenticated: false,
			isGuestMode: false,
			isInitialized: false,
			isLoading: false,
			isRateLimited: false,
			isSessionUnavailable: false,
			login: async (email, password) => {
				const version = ++identityVersion;
				set({ error: null, isLoading: true, isRateLimited: false });
				let result: Awaited<ReturnType<typeof authClient.signIn.email>>;
				try {
					result = await authClient.signIn.email({ email, password });
				} catch {
					if (version !== identityVersion) return false;
					set({ error: "Servidor indisponível. Tente novamente em instantes.", isLoading: false });
					return false;
				}
				if (version !== identityVersion) return false;
				const { data, error } = result;
				if (error || !data?.user) {
					set({
						error: error ? getAuthErrorMessage(error) : "Não foi possível entrar.",
						isLoading: false,
						isRateLimited: error?.status === 429,
					});
					return false;
				}
				set({
					error: null,
					isAuthenticated: true,
					isGuestMode: false,
					isInitialized: true,
					isLoading: false,
					isSessionUnavailable: false,
					user: data.user as AuthUser,
				});
				return true;
			},
			logout: async () => {
				const version = ++identityVersion;
				try {
					const { error } = await authClient.signOut();
					if (version !== identityVersion) return;
					if (error) {
						set({ error: getAuthErrorMessage(error), isLoading: false });
						return;
					}
				} catch {
					if (version === identityVersion)
						set({ error: "Servidor indisponível. Tente novamente em instantes.", isLoading: false });
					return;
				}
				set({
					error: null,
					isAuthenticated: false,
					isGuestMode: false,
					isInitialized: true,
					isLoading: false,
					isRateLimited: false,
					isSessionUnavailable: false,
					user: null,
				});
			},
			register: async (name, email, password) => {
				set({ error: null, isLoading: true, isRateLimited: false });
				let result: Awaited<ReturnType<typeof authClient.signUp.email>>;
				try {
					result = await authClient.signUp.email({ email, name, password });
				} catch {
					set({ error: "Servidor indisponível. Tente novamente em instantes.", isLoading: false });
					return false;
				}
				const { error } = result;
				if (error) {
					set({
						error: getAuthErrorMessage(error),
						isLoading: false,
						isRateLimited: error.status === 429,
					});
					return false;
				}
				set({ error: null, isLoading: false });
				return true;
			},
			user: null,
		}),
		{
			name: "zaimu-auth",
			partialize: state => ({ guestId: state.guestId, isGuestMode: state.isGuestMode }),
			storage: createJSONStorage(() => localStorage),
		},
	),
);

export const getAuthHeader = (): HeadersInit => ({});
