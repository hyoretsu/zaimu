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
	pendingPurchases: Array<{ externalId: string; currentInstallment: number }>,
) {
	return purchases.flatMap<IdentifiedPurchase & { reconciledCreditPurchaseId: null | string }>(purchase => {
		if (
			pendingPurchases.some(
				pending =>
					pending.externalId === purchase.externalId &&
					pending.currentInstallment === purchase.currentInstallment,
			)
		)
			return [];
		const rootId = existingRoots.get(purchase.externalId);
		if (!rootId) return [{ ...purchase, reconciledCreditPurchaseId: null }];
		if (purchase.installmentAmount < 0) return [];
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
			(purchase.installments <= 1 && !anticipated) ||
			(!anticipated && importedNumbers.has(purchase.currentInstallment))
		)
			return [];
		return [{ ...purchase, reconciledCreditPurchaseId: rootId }];
	});
}

/** Only the same unconfirmed installment can block completion of this invoice. */
export function findPendingImport(
	purchases: Array<{ externalId: string; currentInstallment: number }>,
	pendingPurchases: Array<{ externalId: string; currentInstallment: number; creditCardImportId: string }>,
) {
	return pendingPurchases.find(pending =>
		purchases.some(
			purchase =>
				purchase.externalId === pending.externalId &&
				purchase.currentInstallment === pending.currentInstallment,
		),
	)?.creditCardImportId;
}
