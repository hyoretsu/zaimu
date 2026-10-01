import { useQueryClient } from "@tanstack/react-query";
import { createRootRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout";
import { Skeleton } from "@/components/ui/Skeleton";
import { initLocalDb, materializeLocalCreditBooks } from "@/lib/localStorage";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { materializeLocalRecurrences } from "@/lib/recurrence-service";
import { useAuthStore, useThemeStore } from "@/stores";

function AppLoadingState() {
	return (
		<div className="grid min-h-dvh grid-cols-1 gap-6 p-5 lg:grid-cols-[240px_1fr] lg:p-8">
			<Skeleton className="hidden h-full lg:block" />
			<div className="grid content-start gap-5">
				<Skeleton className="h-12 w-56" />
				<div className="grid gap-4 md:grid-cols-3">
					<Skeleton className="h-36" />
					<Skeleton className="h-36" />
					<Skeleton className="h-36" />
				</div>
				<Skeleton className="h-80" />
			</div>
		</div>
	);
}

function RootComponent() {
	const pathname = useLocation().pathname;
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const previousIdentity = useRef(identity);
	const initializeTheme = useThemeStore(state => state.initializeTheme);
	const { initialize, isAuthenticated, isGuestMode, isInitialized, isRateLimited } = useAuthStore();
	const isPublicRoute =
		pathname.startsWith("/auth") ||
		pathname === "/delete-account" ||
		pathname === "/privacy" ||
		pathname === "/terms";

	useEffect(() => {
		initializeTheme();
		void initLocalDb();
		void initialize();
	}, [initialize, initializeTheme]);

	useEffect(() => {
		if (!identity || !isGuestMode) return;
		let active = true;
		const materialize = async () => {
			try {
				const recurringChanged = await materializeLocalRecurrences(identity);
				if (active && recurringChanged) await invalidateCacheOperation(queryClient, identity, "recurring");
				const changed = await materializeLocalCreditBooks(identity);
				if (active && changed) await invalidateCacheOperation(queryClient, identity, "statement");
			} catch (error) {
				if (active)
					toast.error(error instanceof Error ? error.message : "Não foi possível atualizar parcelas locais.");
			}
		};
		void materialize();
		const timer = setInterval(() => void materialize(), 60000);
		const onVisible = () => {
			if (document.visibilityState === "visible") void materialize();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			active = false;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [identity, isGuestMode, queryClient]);

	useEffect(() => {
		if (!isInitialized || isPublicRoute || isRateLimited || isAuthenticated || isGuestMode) return;
		void navigate({ to: "/auth" });
	}, [isAuthenticated, isGuestMode, isInitialized, isPublicRoute, isRateLimited, navigate]);

	useEffect(() => {
		if (isRateLimited) toast.error("Não foi possível validar a sessão agora. Tente novamente em instantes.");
	}, [isRateLimited]);

	useEffect(() => {
		const previous = previousIdentity.current;
		previousIdentity.current = identity;
		if (!previous || previous === identity) return;
		void queryClient.cancelQueries({ queryKey: ["identity", previous] }).then(() => {
			queryClient.removeQueries({ queryKey: ["identity", previous] });
		});
	}, [identity, queryClient]);

	if (!isPublicRoute && !isInitialized) return <AppLoadingState />;
	if (isPublicRoute) return <Outlet />;
	return (
		<AppShell key={identity}>
			<Outlet />
		</AppShell>
	);
}

export const Route = createRootRoute({ component: RootComponent });
