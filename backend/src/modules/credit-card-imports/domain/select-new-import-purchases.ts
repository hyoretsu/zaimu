import type { CreditCardStatementPurchase } from "./credit-card-statement";

type IdentifiedPurchase = CreditCardStatementPurchase & {
	externalId: string;
	financingSourceExternalId?: string;
};

export function selectNewImportPurchases(
	purchases: IdentifiedPurchase[],
	existingRoots: Map<string, string>,
	existingInstallments: Array<{
		currentInstallment: number;
		hasImportedAmount: boolean;
		id: string;
		parentId: null | string;
	}>,
	pendingIds: Set<string>,
) {
	return purchases.flatMap<IdentifiedPurchase & { reconciledCreditPurchaseId: null | string }>(purchase => {
		if (pendingIds.has(purchase.externalId)) return [];
		const rootId = existingRoots.get(purchase.externalId);
		if (!rootId) return [{ ...purchase, reconciledCreditPurchaseId: null }];
		if (
			!purchase.description.startsWith("FIN ") ||
			existingInstallments.some(
				installment =>
					(installment.id === rootId || installment.parentId === rootId) &&
					installment.currentInstallment === purchase.currentInstallment &&
					installment.hasImportedAmount,
			)
		)
			return [];
		return [{ ...purchase, reconciledCreditPurchaseId: rootId }];
	});
}
