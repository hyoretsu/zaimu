interface AccountDraft {
	destinationFinancialAccountId?: string | null;
	originFinancialAccountId?: string | null;
	type: string;
}

export function getTransactionFormAccounts(draft: AccountDraft, type: string) {
	const destinationOnly = type === "INCOME" || type === "YIELD";
	const wasDestinationOnly = draft.type === "INCOME" || draft.type === "YIELD";
	const primaryAccountId =
		(wasDestinationOnly ? draft.destinationFinancialAccountId : draft.originFinancialAccountId) ?? "";
	return {
		destinationFinancialAccountId: destinationOnly
			? primaryAccountId
			: type === "TRANSFER" && !wasDestinationOnly
				? (draft.destinationFinancialAccountId ?? "")
				: "",
		originFinancialAccountId: destinationOnly ? "" : primaryAccountId,
	};
}
