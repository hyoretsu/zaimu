import { useLocation } from "@tanstack/react-router";
import { Activity, type ComponentType, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { AccountsPage } from "@/routes/accounts";
import { CreditCardsPage } from "@/routes/credit-cards";
import { DebtsPage } from "@/routes/debts";
import { DashboardPage } from "@/routes/index";
import { EmpréstimosPage } from "@/routes/loans";
import { MorePage } from "@/routes/more";
import { RecurringPage } from "@/routes/recurring";
import { AjustesPage } from "@/routes/settings";
import { TransactionsPage } from "@/routes/transactions";
import { MobileNavigation } from "./MobileNavigation";
import {
	createMobileTabRoutes,
	type MobileScreenPath,
	type MobileTabId,
	mobileTabIds,
	resolveMobileRoute,
	updateMobileTabRoute,
} from "./mobile-tabs";

const screenByPath = {
	"/": DashboardPage,
	"/accounts": AccountsPage,
	"/credit-cards": CreditCardsPage,
	"/debts": DebtsPage,
	"/loans": EmpréstimosPage,
	"/more": MorePage,
	"/recurring": RecurringPage,
	"/settings": AjustesPage,
	"/transactions": TransactionsPage,
} satisfies Record<MobileScreenPath, ComponentType>;

export function MobileAppShell() {
	const pathname = useLocation().pathname;
	const currentRoute = resolveMobileRoute(pathname) ?? {
		screenPath: "/" as const,
		tabId: "overview" as const,
	};
	const [tabRoutes, setTabRoutes] = useState(() => createMobileTabRoutes(pathname));
	const [visitedTabs, setVisitedTabs] = useState<Set<(typeof mobileTabIds)[number]>>(
		() => new Set([currentRoute.tabId]),
	);
	const scrollAreas = useRef(new Map<MobileTabId, HTMLDivElement>());
	const renderedRoutes = updateMobileTabRoute(tabRoutes, pathname);

	const scrollToTabTop = (tabId: MobileTabId) => {
		const viewport = scrollAreas.current
			.get(tabId)
			?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
		viewport?.scrollTo({ behavior: "auto", top: 0 });
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
							key={screenPath}
							ref={element => {
								if (element) scrollAreas.current.set(tabId, element);
								else scrollAreas.current.delete(tabId);
							}}
						>
							<main className="min-h-dvh w-full min-w-0 max-w-full pb-24">
								<Screen />
							</main>
						</ScrollArea>
					</Activity>
				);
			})}
			<MobileNavigation activeTab={currentRoute.tabId} onReselect={scrollToTabTop} routes={renderedRoutes} />
		</div>
	);
}
