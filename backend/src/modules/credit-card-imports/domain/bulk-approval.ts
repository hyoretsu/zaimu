interface BulkApprovalItem {
	installmentAmount: number | string;
	metadataMissing: string[];
	reconciledCreditPurchaseId: string | null;
}

export function canBulkApprovePurchase(
	item: BulkApprovalItem,
	hasPendingDuplicate: boolean,
	includeUnmatched: boolean,
) {
	return (
		(includeUnmatched || Boolean(item.reconciledCreditPurchaseId)) &&
		!hasPendingDuplicate &&
		Number(item.installmentAmount) >= 0 &&
		item.metadataMissing.length === 0
	);
}
