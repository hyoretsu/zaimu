import type { BookRefund } from "@zaimu/finance/credit-book";
import { uniquePurchaseMatches } from "./unique-purchase-matches";

export interface RefundMatchItem extends Record<string, unknown> {
	id: string;
	externalId: string;
	installmentAmount: number | string;
	purchaseDate: string | Date;
	reconciledCreditPurchaseId: string | null;
	refundReview: unknown;
}

/** Match existing financial facts only when both sides have a single claim. */
export function existingRefundMatches(items: RefundMatchItem[], refunds: readonly BookRefund[]) {
	return uniquePurchaseMatches(
		new Map(
			items.map(item => {
				const identified = refunds.filter(refund => refund.externalId === item.externalId);
				const candidates = (identified.length ? identified : refunds).filter(
					refund =>
						!refund.deletedAt &&
						(!refund.externalId || refund.externalId === item.externalId) &&
						refund.creditDate === new Date(item.purchaseDate).toISOString().slice(0, 10) &&
						refund.amountCents === Math.round(Math.abs(Number(item.installmentAmount)) * 100) &&
						(!item.reconciledCreditPurchaseId || item.reconciledCreditPurchaseId === refund.purchaseId),
				);
				return [item.id, candidates];
			}),
		),
	).filter(([id]) => !items.find(item => item.id === id)?.refundReview);
}
