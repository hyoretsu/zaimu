export const mobileTabIds = ["overview", "transactions", "accounts", "creditCards", "more"] as const;

export type MobileTabId = (typeof mobileTabIds)[number];

export const mobileScreenPaths = [
	"/",
	"/transactions",
	"/accounts",
	"/credit-cards",
	"/more",
	"/debts",
	"/loans",
	"/recurring",
	"/settings",
	"/settings/open-finance",
] as const;

export type MobileScreenPath = (typeof mobileScreenPaths)[number];
export type MobileTabRoutes = Record<MobileTabId, MobileScreenPath>;

export const mobileTabRoots = {
	accounts: "/accounts",
	creditCards: "/credit-cards",
	more: "/more",
	overview: "/",
	transactions: "/transactions",
} as const satisfies MobileTabRoutes;

const tabByScreen = {
	"/": "overview",
	"/accounts": "accounts",
	"/credit-cards": "creditCards",
	"/debts": "more",
	"/loans": "more",
	"/more": "more",
	"/recurring": "more",
	"/settings": "more",
	"/settings/open-finance": "more",
	"/transactions": "transactions",
} as const satisfies Record<MobileScreenPath, MobileTabId>;

export interface MobileRoute {
	screenPath: MobileScreenPath;
	tabId: MobileTabId;
}

export function resolveMobileRoute(pathname: string): MobileRoute | null {
	const screenPath =
		pathname === "/salaries" || pathname === "/subscriptions"
			? "/recurring"
			: mobileScreenPaths.find(path => path === pathname);

	if (!screenPath) return null;
	return { screenPath, tabId: tabByScreen[screenPath] };
}

export function createMobileTabRoutes(pathname: string): MobileTabRoutes {
	return updateMobileTabRoute(mobileTabRoots, pathname);
}

export function resolveMobileTabDestination(
	routes: MobileTabRoutes,
	activeTabId: MobileTabId,
	targetTabId: MobileTabId,
): MobileScreenPath {
	return targetTabId === activeTabId ? mobileTabRoots[targetTabId] : routes[targetTabId];
}

export function updateMobileTabRoute(routes: MobileTabRoutes, pathname: string): MobileTabRoutes {
	const route = resolveMobileRoute(pathname);
	if (!route || routes[route.tabId] === route.screenPath) return routes;
	return { ...routes, [route.tabId]: route.screenPath };
}
