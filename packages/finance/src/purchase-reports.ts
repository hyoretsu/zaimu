import {
	assertDateKey,
	assertPurchase,
	type CreditPurchase,
	purchaseMetadata,
	sumCents,
} from "./credit-purchase";
import type { CreditRefund, RefundEffect } from "./credit-refund";

/** Consumption is attributed once, to the original purchase period and current metadata. */
export function purchaseSpending(purchase: CreditPurchase, refunds: readonly CreditRefund[]) {
	assertPurchase(purchase);
	const related = refunds.filter(refund => refund.purchaseId === purchase.id);
	const refundedAmountCents = sumCents(related.map(refund => refund.amountCents));
	if (refundedAmountCents > purchase.totalAmountCents)
		throw new RangeError("Os reembolsos excedem o total da compra");
	return {
		...purchaseMetadata(purchase),
		date: purchase.purchaseDate,
		grossAmountCents: purchase.totalAmountCents,
		netAmountCents: purchase.totalAmountCents - refundedAmountCents,
		purchaseId: purchase.id,
		refundedAmountCents,
	};
}

/** Credit is an invoice adjustment, not account income or another ordinary expense. */
export function refundCreditEntry(purchase: CreditPurchase, refund: CreditRefund, effect: RefundEffect) {
	if (refund.purchaseId !== purchase.id || refund.id !== effect.refundId)
		throw new RangeError("Vínculo do reembolso inválido");
	assertDateKey(refund.creditDate);
	if (
		effect.creditAmountCents < 0 ||
		effect.creditAmountCents + effect.canceledAmountCents !== refund.amountCents
	)
		throw new RangeError("Crédito do reembolso inválido");
	return {
		...purchaseMetadata(purchase),
		amountCents: effect.creditAmountCents,
		date: refund.creditDate,
		id: refund.id,
		kind: "REFUND" as const,
		purchaseId: purchase.id,
		statementId: refund.creditStatementId,
	};
}
