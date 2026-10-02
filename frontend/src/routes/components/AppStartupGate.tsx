import type { ReactNode } from "react";
import { AppLoadingState } from "./AppLoadingState";
import { LocalStorageError } from "./LocalStorageError";

interface AppStartupGateProps {
	children: ReactNode;
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
}: AppStartupGateProps) {
	if (!isInitialized) return <AppLoadingState />;
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
