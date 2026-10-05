import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { Activity, type ComponentType, lazy, Suspense, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useCacheIdentity } from "@/lib/query-cache";
import { MobileNavigation } from "./MobileNavigation";
import { MobileScreenSkeleton } from "./MobileScreenSkeleton";
import {
	createMobileTabRoutes,
	type MobileScreenPath,
	type MobileTabId,
	mobileTabIds,
	resolveMobileRoute,
	updateMobileTabRoute,
} from "./mobile-tabs";

const AccountsPage = lazy(() =>
	import("@/routes/accounts/components/AccountsPage").then(module => ({ default: module.AccountsPage })),
);
const CreditCardsPage = lazy(() =>
	import("@/routes/credit-cards/components/CreditCardsPage").then(module => ({
		default: module.CreditCardsPage,
	})),
);
const DebtsPage = lazy(() =>
	import("@/routes/debts/components/DebtsPage").then(module => ({ default: module.DebtsPage })),
);
const DashboardPage = lazy(() =>
	import("@/routes/components/DashboardPage").then(module => ({ default: module.DashboardPage })),
);
const EmpréstimosPage = lazy(() =>
	import("@/routes/loans/components/EmpréstimosPage").then(module => ({ default: module.EmpréstimosPage })),
);
const MorePage = lazy(() =>
	import("@/routes/more/components/MorePage").then(module => ({ default: module.MorePage })),
);
const RecurringPage = lazy(() =>
	import("@/routes/recurring/components/RecurringPage").then(module => ({ default: module.RecurringPage })),
);
const AjustesPage = lazy(() =>
	import("@/routes/settings/components/AjustesPage").then(module => ({ default: module.AjustesPage })),
);
const OpenFinancePage = lazy(() =>
	import("@/routes/settings/open-finance/components/OpenFinancePage").then(module => ({
		default: module.OpenFinancePage,
	})),
);
const TransactionsPage = lazy(() =>
	import("@/routes/transactions/components/TransactionsPage").then(module => ({
		default: module.TransactionsPage,
	})),
);

const screenByPath = {
	"/": DashboardPage,
	"/accounts": AccountsPage,
	"/credit-cards": CreditCardsPage,
	"/debts": DebtsPage,
	"/loans": EmpréstimosPage,
	"/more": MorePage,
	"/recurring": RecurringPage,
	"/settings": AjustesPage,
	"/settings/open-finance": OpenFinancePage,
	"/transactions": TransactionsPage,
} satisfies Record<MobileScreenPath, ComponentType>;

export function MobileAppShell() {
	const pathname = useLocation().pathname;
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const currentRoute = resolveMobileRoute(pathname) ?? {
		screenPath: "/" as const,
		tabId: "overview" as const,
	};
	const [tabRoutes, setTabRoutes] = useState(() => createMobileTabRoutes(pathname));
	const [visitedTabs, setVisitedTabs] = useState<Set<(typeof mobileTabIds)[number]>>(
		() => new Set([currentRoute.tabId]),
	);
	const [refreshVersions, setRefreshVersions] = useState<Record<MobileTabId, number>>({
		accounts: 0,
		creditCards: 0,
		more: 0,
		overview: 0,
		transactions: 0,
	});
	const renderedRoutes = updateMobileTabRoute(tabRoutes, pathname);

	const refreshTab = (tabId: MobileTabId, staysOnScreen: boolean) => {
		if (identity) queryClient.removeQueries({ queryKey: ["identity", identity] });
		if (staysOnScreen) {
			setRefreshVersions(versions => ({ ...versions, [tabId]: versions[tabId] + 1 }));
		}
	};

	useEffect(() => {
		setTabRoutes(routes => updateMobileTabRoute(routes, pathname));
		setVisitedTabs(tabs => {
			if (tabs.has(currentRoute.tabId)) return tabs;
			return new Set([...tabs, currentRoute.tabId]);
		});
	}, [currentRoute.tabId, pathname]);

	return (
		<div className="h-dvh overflow-hidden bg-background">
			{mobileTabIds.map(tabId => {
				if (!(visitedTabs.has(tabId) || tabId === currentRoute.tabId)) return null;
				const screenPath = renderedRoutes[tabId];
				const Screen = screenByPath[screenPath];
				return (
					<Activity
						key={tabId}
						mode={tabId === currentRoute.tabId ? "visible" : "hidden"}
						name={`mobile-tab-${tabId}`}
					>
						<ScrollArea
							className="mobile-tab-scroll-area h-dvh w-full min-w-0 max-w-full"
							key={`${screenPath}:${refreshVersions[tabId]}`}
						>
							<main className="min-h-dvh w-full min-w-0 max-w-full pb-[calc(var(--mobile-navigation-height)+5.5rem)]">
								<Suspense fallback={<MobileScreenSkeleton />}>
									<Screen />
								</Suspense>
							</main>
						</ScrollArea>
					</Activity>
				);
			})}
			<MobileNavigation activeTab={currentRoute.tabId} onReselect={refreshTab} routes={renderedRoutes} />
		</div>
	);
}
