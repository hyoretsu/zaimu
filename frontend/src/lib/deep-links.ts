import type { AnyRouter } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { parseTransferDeepLink } from "./transfer-deep-links";

export interface AuthDeepLink {
	token: string;
	to: "/auth/reset-password" | "/auth/verify-email";
}

export const parseAuthDeepLink = (rawUrl: string): AuthDeepLink | null => {
	try {
		const url = new URL(rawUrl);
		const path = url.protocol === "zaimu:" ? `/${url.hostname}${url.pathname}` : url.pathname;
		const token = url.searchParams.get("token")?.trim();
		if (!token) return null;
		if (path === "/auth/reset-password") return { to: "/auth/reset-password", token };
		if (path === "/auth/verify-email") return { to: "/auth/verify-email", token };
		return null;
	} catch {
		return null;
	}
};

const navigateToDeepLink = (router: AnyRouter, rawUrl: string) => {
	const transfer = parseTransferDeepLink(rawUrl);
	if (transfer) {
		void router.navigate({ search: { transfer: transfer.id }, to: "/account-transfers" });
		return;
	}
	const link = parseAuthDeepLink(rawUrl);
	if (!link) return;
	void router.navigate({ search: { token: link.token }, to: link.to });
};

export const initializeDeepLinks = async (router: AnyRouter) => {
	if (!isTauri()) return;
	const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
	const currentUrls = await getCurrent();
	currentUrls?.forEach(url => navigateToDeepLink(router, url));
	await onOpenUrl(urls => urls.forEach(url => navigateToDeepLink(router, url)));
};
