import type { ReactNode } from "react";
import { AccountTransferBanner } from "@/components/account-transfers";
import { PushNotificationLifecycle } from "@/components/notifications/PushNotificationLifecycle";
import { useMediaQuery } from "@/hooks/use-media-query";
import { AppSidebar } from "./AppSidebar";
import { MobileAppShell } from "./MobileAppShell";

export function AppShell({ children }: { children: ReactNode }) {
	const isMobile = useMediaQuery("(max-width: 1023px)");
	if (isMobile)
		return (
			<>
				<PushNotificationLifecycle />
				<MobileAppShell />
			</>
		);

	return (
		<div className="bg-background min-h-dvh overflow-x-clip">
			<PushNotificationLifecycle />
			<AppSidebar />
			<main className="min-h-dvh min-w-0 lg:ml-64">
				<AccountTransferBanner />
				{children}
			</main>
		</div>
	);
}
