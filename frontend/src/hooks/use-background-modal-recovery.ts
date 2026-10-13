import { useEffect } from "react";
import { type ModalRecovery, takeModalRecovery, useModalRecoveryStore } from "@/lib/background-modal-actions";

export function useBackgroundModalRecovery<T>(kind: string, onRecover: (entry: ModalRecovery<T>) => void) {
	const requestedId = useModalRecoveryStore(state => state.requestedId);
	useEffect(() => {
		if (!requestedId) return;
		const entry = takeModalRecovery<T>(kind);
		if (entry) onRecover(entry);
	}, [kind, onRecover, requestedId]);
}
