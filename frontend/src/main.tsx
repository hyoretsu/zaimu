import { tanstackClient } from "@hyoretsu/kubb/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/Sonner";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { configureModalRecoveryNavigation } from "@/lib/background-modal-actions";
import { initializeDeepLinks } from "@/lib/deep-links";
import { configureMutationInvalidation } from "@/lib/mutation-cache";
import { configureQueryTags } from "@/lib/query-tags";
import { initializeVisibleViewport } from "./lib/visible-viewport";
import { routeTree } from "./routeTree.gen";
import "./index.css";

const queryClient = tanstackClient({ staleTime: 1000 * 60 * 5 });
queryClient.setDefaultOptions({
	// Existing identity-scoped policies handle invalidation. Kubb's default
	// mutation callback otherwise invalidates every query without a key.
	mutations: { retry: 0 },
	queries: {
		refetchOnWindowFocus: true,
		retry: 2,
		staleTime: 1000 * 60 * 5,
	},
});

configureMutationInvalidation(queryClient);
configureQueryTags(queryClient);

const router = createRouter({
	context: {
		queryClient,
	},
	defaultPreload: "intent",
	defaultPreloadStaleTime: 0,
	routeTree,
});

configureModalRecoveryNavigation(path => router.navigate({ to: path as never }));

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

void initializeDeepLinks(router);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<RouterProvider router={router} />
				<Toaster position="top-center" richColors />
			</TooltipProvider>
		</QueryClientProvider>
	</StrictMode>,
);

const disposeVisibleViewport = initializeVisibleViewport();
if (import.meta.hot) import.meta.hot.dispose(disposeVisibleViewport);
