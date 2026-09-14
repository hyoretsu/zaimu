import { Link } from "@tanstack/react-router";
import { type MobileTabId, type MobileTabRoutes, resolveMobileTabDestination } from "./mobile-tabs";
import { primaryNavigation } from "./navigation";

const mobileItems = [
	{ ...primaryNavigation[0], tabId: "overview" },
	{ ...primaryNavigation[1], tabId: "transactions" },
	{ ...primaryNavigation[2], tabId: "accounts" },
	{ ...primaryNavigation[3], tabId: "creditCards" },
	{ ...primaryNavigation[5], tabId: "more" },
] as const satisfies ReadonlyArray<(typeof primaryNavigation)[number] & { tabId: MobileTabId }>;

interface MobileNavigationProps {
	activeTab: MobileTabId;
	onReselect: (tabId: MobileTabId) => void;
	routes: MobileTabRoutes;
}

export function MobileNavigation({ activeTab, onReselect, routes }: MobileNavigationProps) {
	return (
		<nav
			aria-label="Navegação móvel"
			className="safe-area-bottom fixed right-0 bottom-0 left-0 z-40 border-border border-t bg-card/95 px-2 pt-2 shadow-[0_-12px_36px_-26px_rgba(36,36,36,.45)] backdrop-blur-xl"
		>
			<div className="mx-auto flex max-w-xl justify-around">
				{mobileItems.map(item => {
					const isActive = item.tabId === activeTab;
					const destination = resolveMobileTabDestination(routes, activeTab, item.tabId);
					return (
						<Link
							aria-current={isActive ? "page" : undefined}
							className={
								isActive
									? "flex min-w-14 cursor-pointer flex-col items-center gap-1 rounded-xl border border-primary/15 bg-primary/10 px-2 py-2 font-semibold text-[10px] text-primary"
									: "flex min-w-14 cursor-pointer flex-col items-center gap-1 rounded-xl border border-transparent px-2 py-2 font-medium text-[10px] text-muted-foreground hover:border-border hover:bg-muted"
							}
							key={item.tabId}
							onClick={event => {
								if (!isActive || destination !== routes[item.tabId]) return;
								event.preventDefault();
								onReselect(item.tabId);
							}}
							resetScroll={false}
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
