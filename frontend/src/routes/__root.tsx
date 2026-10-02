import { useQueryClient } from "@tanstack/react-query";
import { createRootRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout";
import { initLocalDb, materializeLocalCreditBooks } from "@/lib/localStorage";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { materializeLocalRecurrences } from "@/lib/recurrence-service";
import { useAuthStore, useThemeStore } from "@/stores";
import { AppLoadingState } from "./components/AppLoadingState";
import { LocalUpgradeReview } from "./components/LocalUpgradeReview";

function RootComponent() {
	const [localReady, setLocalReady] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);
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
		let active = true;
		void initLocalDb()
			.then(() => {
				if (active) setLocalReady(true);
			})
			.catch(error => {
				if (active) setLocalError(error instanceof Error ? error.message : "Falha no armazenamento local");
			});
		void initialize();
		return () => {
			active = false;
		};
	}, [initialize, initializeTheme]);

	useEffect(() => {
		if (!localReady || !identity || !isGuestMode) return;
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
	}, [identity, isGuestMode, localReady, queryClient]);

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

	if (localError)
		return (
			<LocalUpgradeReview
				error={localError}
				onRetry={async () => {
					await initLocalDb();
					setLocalReady(true);
					setLocalError(null);
				}}
			/>
		);
	if (!localReady) return <AppLoadingState />;
	if (!isPublicRoute && !isInitialized) return <AppLoadingState />;
	if (isPublicRoute) return <Outlet />;
	return (
		<AppShell key={identity}>
			<Outlet />
		</AppShell>
	);
}

export const Route = createRootRoute({ component: RootComponent });
