interface AccountDraft {
	destinationFinancialAccountId?: string | null;
	originFinancialAccountId?: string | null;
	type: string;
}

export function getTransactionFormAccounts(draft: AccountDraft, type: string) {
	const destinationOnly = type === "INCOME" || type === "YIELD";
	const wasDestinationOnly = draft.type === "INCOME" || draft.type === "YIELD";
	if (type === "TRANSFER") {
		return {
			destinationFinancialAccountId: draft.destinationFinancialAccountId ?? "",
			originFinancialAccountId: draft.originFinancialAccountId ?? "",
		};
	}
	const primaryAccountId =
		((draft.type === "TRANSFER" ? destinationOnly : wasDestinationOnly)
			? draft.destinationFinancialAccountId
			: draft.originFinancialAccountId) ?? "";
	return {
		destinationFinancialAccountId: destinationOnly ? primaryAccountId : "",
		originFinancialAccountId: destinationOnly ? "" : primaryAccountId,
	};
}
