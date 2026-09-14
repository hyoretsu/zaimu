import type { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { AppSidebar } from "./AppSidebar";
import { MobileAppShell } from "./MobileAppShell";

export function AppShell({ children }: { children: ReactNode }) {
	const isMobile = useMediaQuery("(max-width: 1023px)");
	if (isMobile) return <MobileAppShell />;

	return (
		<div className="min-h-dvh overflow-x-clip bg-background">
			<AppSidebar />
			<main className="min-h-dvh min-w-0 lg:ml-64">{children}</main>
		</div>
	);
}
