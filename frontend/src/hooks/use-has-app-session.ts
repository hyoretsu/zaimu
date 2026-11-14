import { useAuthStore } from "@/stores";

/** Connected and guest users use the app shell; visitors get the public chrome. */
export function useHasAppSession() {
	return useAuthStore(state => state.isAuthenticated || state.isGuestMode);
}
