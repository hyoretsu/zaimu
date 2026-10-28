import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { initializePushListeners } from "@/lib/push-notifications";
import { parseTransferDeepLink } from "@/lib/transfer-deep-links";
import { useAuthStore } from "@/stores/auth";

export function PushNotificationLifecycle() {
	const router = useRouter();
	const userId = useAuthStore(state => state.user?.id);
	useEffect(() => {
		if (!userId) return;
		let disposed = false;
		let cleanup: (() => void) | undefined;
		void initializePushListeners(raw => {
			const link = parseTransferDeepLink(raw);
			if (link) void router.navigate({ search: { transfer: link.id }, to: "/account-transfers" });
		})
			.then(unlisten => {
				if (disposed) unlisten();
				else cleanup = unlisten;
			})
			.catch(() => undefined);
		return () => {
			disposed = true;
			cleanup?.();
		};
	}, [router, userId]);
	return null;
}
