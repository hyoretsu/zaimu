import { Link } from "@tanstack/react-router";
import { type MobileTabId, type MobileTabRoutes, resolveMobileTabDestination } from "./mobile-tabs";
import { mobileNavigation } from "./navigation";

interface MobileNavigationProps {
	activeTab: MobileTabId;
	onReselect: (tabId: MobileTabId, staysOnScreen: boolean) => void;
	routes: MobileTabRoutes;
	searchByPath: Record<string, Record<string, unknown>>;
}

export function MobileNavigation({ activeTab, onReselect, routes, searchByPath }: MobileNavigationProps) {
	return (
		<nav
			aria-label="Navegação móvel"
			className="safe-area-bottom border-border bg-card/95 fixed right-0 bottom-0 left-0 z-40 border-t px-2 pt-2 shadow-[0_-12px_36px_-26px_rgba(36,36,36,.45)] backdrop-blur-xl"
		>
			<div className="mx-auto flex h-14 max-w-xl justify-around">
				{mobileNavigation.map(item => {
					const isActive = item.tabId === activeTab;
					const destination = resolveMobileTabDestination(routes, activeTab, item.tabId);
					return (
						<Link
							aria-current={isActive ? "page" : undefined}
							className={
								isActive
									? "border-primary/15 bg-primary/10 text-primary flex h-14 min-w-14 cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-semibold"
									: "text-muted-foreground hover:border-border hover:bg-muted flex h-14 min-w-14 cursor-pointer flex-col items-center gap-1 rounded-xl border border-transparent px-2 py-2 text-[10px] font-medium"
							}
							key={item.tabId}
							onClick={event => {
								if (!isActive) return;
								const staysOnScreen = destination === routes[item.tabId];
								if (staysOnScreen) event.preventDefault();
								onReselect(item.tabId, staysOnScreen);
							}}
							resetScroll={false}
							search={searchByPath[destination] ?? {}}
							to={destination}
						>
							<item.icon aria-hidden className="size-5" />
							{item.label}
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
