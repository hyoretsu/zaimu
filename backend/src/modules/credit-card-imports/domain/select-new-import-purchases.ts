import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import type { CreditCardStatementPurchase } from "./credit-card-statement";

type IdentifiedPurchase = CreditCardStatementPurchase & {
	externalId: string;
	financingSourceExternalId?: string;
	financingTargetExternalId?: string;
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
		const anticipated = importedAnticipation(purchase.description);
		const importedNumbers = new Set(
			existingInstallments
				.filter(
					installment =>
						(installment.id === rootId || installment.parentId === rootId) && installment.hasImportedAmount,
				)
				.map(installment => installment.currentInstallment),
		);
		if (
			(!purchase.description.startsWith("FIN ") && !anticipated) ||
			(!anticipated && importedNumbers.has(purchase.currentInstallment))
		)
			return [];
		return [{ ...purchase, reconciledCreditPurchaseId: rootId }];
	});
}
