export interface CreditPurchaseSyncRow {
	hasImportedAmount: boolean;
	id: string;
	installments: number;
	parentId: null | string;
	statementDate: Date;
}

export interface CreditPurchaseSyncStatus {
	isFullySynced: boolean;
	isSynced: boolean;
}

export function getCreditPurchaseSyncStatus(
	purchases: CreditPurchaseSyncRow[],
	today = new Date(),
): Map<string, CreditPurchaseSyncStatus> {
	const groups = new Map<string, CreditPurchaseSyncRow[]>();
	for (const purchase of purchases) {
		const rootId = purchase.parentId ?? purchase.id;
		groups.set(rootId, [...(groups.get(rootId) ?? []), purchase]);
	}
	const statuses = new Map<string, CreditPurchaseSyncStatus>();
	for (const purchase of purchases) {
		const installments = groups.get(purchase.parentId ?? purchase.id) ?? [];
		const currentOrPast = installments.filter(installment => installment.statementDate <= today);
		const isEveryInstallmentImported =
			installments.length === purchase.installments && installments.every(item => item.hasImportedAmount);
		statuses.set(purchase.id, {
			isFullySynced:
				purchase.parentId === null &&
				currentOrPast.length > 0 &&
				currentOrPast.every(item => item.hasImportedAmount),
			isSynced: purchase.parentId === null ? isEveryInstallmentImported : purchase.hasImportedAmount,
		});
	}
	return statuses;
}
