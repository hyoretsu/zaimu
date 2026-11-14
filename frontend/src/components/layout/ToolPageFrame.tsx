import type { ReactNode } from "react";
import { useHasAppSession } from "@/hooks/use-has-app-session";
import { PublicPageLayout } from "./PublicPageLayout";

/** Tool pages render inside the app shell with a session and in the public chrome without one. */
export function ToolPageFrame({ children }: { children: ReactNode }) {
	const hasSession = useHasAppSession();
	if (hasSession) return <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">{children}</div>;
	return (
		<PublicPageLayout maxWidth="max-w-6xl">
			<div className="space-y-6">{children}</div>
		</PublicPageLayout>
	);
}
