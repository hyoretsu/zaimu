import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createRootRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CurrencyLifecycle } from "@/components/currency/CurrencyLifecycle";
import { AppShell } from "@/components/layout";
import { useOpenFinanceAutoSync } from "@/hooks/use-open-finance";
import { initLocalDb, materializeLocalCreditBooks } from "@/lib/localStorage";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { materializeLocalRecurrences } from "@/lib/recurrence-service";
import { useAuthStore, useThemeStore } from "@/stores";

import { AppStartupGate } from "./components/AppStartupGate";

function RootComponent() {
	useOpenFinanceAutoSync();
	const pathname = useLocation().pathname;
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const previousIdentity = useRef(identity);
	const initializeTheme = useThemeStore(state => state.initializeTheme);
	const {
		initialize,
		isAuthenticated,
		isGuestMode,
		isInitialized,
		isRateLimited,
		isSessionUnavailable,
		isLoading,
	} = useAuthStore();
	const isPublicRoute =
		pathname.startsWith("/auth") ||
		pathname === "/delete-account" ||
		pathname === "/privacy" ||
		pathname === "/terms";

	const localDatabase = useQuery({
		enabled: isInitialized && isGuestMode && !isAuthenticated,
		queryFn: initLocalDb,
		queryKey: ["local-database"],
		retry: false,
	});

	useEffect(() => {
		initializeTheme();
		void initialize();
	}, [initialize, initializeTheme]);

	useEffect(() => {
		if (!localDatabase.isSuccess || !identity || !isGuestMode || isAuthenticated) return;
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
	}, [identity, isAuthenticated, isGuestMode, localDatabase.isSuccess, queryClient]);

	useEffect(() => {
		if (
			!isInitialized ||
			isPublicRoute ||
			isSessionUnavailable ||
			isRateLimited ||
			isAuthenticated ||
			isGuestMode
		)
			return;
		void navigate({ to: "/auth" });
	}, [
		isAuthenticated,
		isGuestMode,
		isInitialized,
		isPublicRoute,
		isRateLimited,
		isSessionUnavailable,
		navigate,
	]);

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

	if (isPublicRoute) return <Outlet />;
	return (
		<AppStartupGate
			isAuthenticated={isAuthenticated}
			isGuestMode={isGuestMode}
			isInitialized={isInitialized}
			localDatabase={localDatabase}
			session={{ pending: isLoading, retry: initialize, unavailable: isSessionUnavailable }}
		>
			<CurrencyLifecycle />
			<AppShell key={identity}>
				<Outlet />
			</AppShell>
		</AppStartupGate>
	);
}

export const Route = createRootRoute({ component: RootComponent });
