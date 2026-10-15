interface ExistingImportEntry {
	externalId: null | string;
	isRefund: boolean;
	id: string;
	purchaseId: null | string;
}

/** CreditEntry repeats the purchase identity on each concrete installment. */
export function existingImportRoots(entries: ExistingImportEntry[]) {
	return new Map(
		entries.flatMap(entry =>
			entry.externalId
				? [[entry.externalId, entry.isRefund ? entry.id : (entry.purchaseId ?? entry.id)] as const]
				: [],
		),
	);
}
