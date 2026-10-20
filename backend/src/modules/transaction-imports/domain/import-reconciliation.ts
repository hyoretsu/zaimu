export type ImportTransactionType = "EXPENSE" | "INCOME" | "TRANSFER" | "YIELD";

export function matchesTransferCounterpart(
	item: { type: ImportTransactionType },
	candidate: {
		destinationFinancialAccountId: string | null;
		originFinancialAccountId: string | null;
		type: ImportTransactionType;
	},
	financialAccountId: string,
) {
	return (
		candidate.type === "TRANSFER" &&
		((item.type === "INCOME" && candidate.destinationFinancialAccountId === financialAccountId) ||
			(item.type === "EXPENSE" && candidate.originFinancialAccountId === financialAccountId))
	);
}

export function matchesDuplicateTransactionShape(
	item: {
		destinationFinancialAccountId: string | null;
		originFinancialAccountId: string | null;
		type: ImportTransactionType;
	},
	candidate: {
		destinationFinancialAccountId: string | null;
		originFinancialAccountId: string | null;
		type: ImportTransactionType;
	},
	financialAccountId: string,
) {
	if (item.type === "TRANSFER" && candidate.type === "TRANSFER")
		return (
			item.originFinancialAccountId === candidate.originFinancialAccountId &&
			item.destinationFinancialAccountId === candidate.destinationFinancialAccountId
		);
	return item.type === candidate.type || matchesTransferCounterpart(item, candidate, financialAccountId);
}

/** Only existing transactions with a unique, uncontested claim can be linked automatically. */
export function uniqueTransactionMatches<T extends { id: string; source: "IMPORT_ITEM" | "TRANSACTION" }>(
	duplicates: Map<string, { candidates: T[] } | null>,
	reservedTransactionIds: Set<string>,
) {
	const claims = new Map<string, number>();
	for (const duplicate of duplicates.values())
		for (const candidate of duplicate?.candidates ?? [])
			if (candidate.source === "TRANSACTION") claims.set(candidate.id, (claims.get(candidate.id) ?? 0) + 1);
	return [...duplicates].flatMap(([itemId, duplicate]): [string, T][] => {
		const candidate = duplicate?.candidates[0];
		return duplicate?.candidates.length === 1 &&
			candidate?.source === "TRANSACTION" &&
			claims.get(candidate.id) === 1 &&
			!reservedTransactionIds.has(candidate.id)
			? [[itemId, candidate]]
			: [];
	});
}
