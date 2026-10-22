import { statementEntryKind } from "@zaimu/finance/credit-card";
import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { matchesExistingCreditPurchase } from "./credit-card-import-reconciliation";
import type { CreditCardStatementPurchase } from "./credit-card-statement";
import { uniquePurchaseMatches } from "./unique-purchase-matches";

type ConfirmedEntry = Parameters<typeof matchesExistingCreditPurchase>[1] & {
	currentInstallment: number;
	hasImportedAmount: boolean;
	id: string;
	isRefund: boolean;
	isStatementCharge: boolean;
	purchaseId: string | null;
};

/** A reconciled purchase can retain a different external identity from the PDF. */
export function confirmedImportRoots(
	purchases: Array<CreditCardStatementPurchase & { externalId: string }>,
	entries: Omit<ConfirmedEntry, "existingInstallments">[],
) {
	const candidates = new Map(
		purchases.map(purchase => [
			purchase.externalId,
			purchase.installmentAmount <= 0 ||
			statementEntryKind(purchase.description) !== "PURCHASE" ||
			importedAnticipation(purchase.description)
				? []
				: entries
						.filter(
							entry =>
								!entry.isRefund &&
								!entry.isStatementCharge &&
								entry.currentInstallment === purchase.currentInstallment &&
								matchesExistingCreditPurchase(
									{ ...purchase, storeName: null },
									{ ...entry, existingInstallments: entry.installments },
								),
						)
						.map(entry => ({
							confirmed:
								entry.hasImportedAmount &&
								Math.round(Number(entry.installmentAmount) * 100) ===
									Math.round(purchase.installmentAmount * 100),
							id: entry.purchaseId ?? entry.id,
						})),
		]),
	);
	return new Map(
		uniquePurchaseMatches(candidates)
			.filter(([, candidate]) => candidate.confirmed)
			.map(([externalId, candidate]) => [externalId, candidate.id]),
	);
}
