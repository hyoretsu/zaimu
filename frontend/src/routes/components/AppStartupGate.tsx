import type { ReactNode } from "react";
import { AppLoadingState } from "./AppLoadingState";
import { LocalStorageError } from "./LocalStorageError";
import { SessionUnavailable } from "./SessionUnavailable";

interface AppStartupGateProps {
	children: ReactNode;
	session?: { unavailable: boolean; pending: boolean; retry: () => Promise<void> };
	isAuthenticated: boolean;
	isGuestMode: boolean;
	isInitialized: boolean;
	localDatabase: {
		isError: boolean;
		isFetching: boolean;
		isPending: boolean;
		refetch: () => Promise<unknown>;
	};
}

export function AppStartupGate({
	children,
	isAuthenticated,
	isGuestMode,
	isInitialized,
	localDatabase,
	session,
}: AppStartupGateProps) {
	if (!isInitialized) return <AppLoadingState />;
	if (session?.unavailable && !isGuestMode)
		return <SessionUnavailable onRetry={session.retry} pending={session.pending} />;
	if (isGuestMode && !isAuthenticated) {
		if (localDatabase.isPending || localDatabase.isFetching) return <AppLoadingState />;
		if (localDatabase.isError)
			return (
				<LocalStorageError
					onRetry={async () => {
						await localDatabase.refetch();
					}}
				/>
			);
	}
	return children;
}
