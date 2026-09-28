import { addBookRefund, removeBookRefund, updateBookRefund } from "@zaimu/finance/credit-book";
import type { RefundPolicy } from "@zaimu/finance/credit-refund";
import { mutateCreditBook, resolveBookPurchase } from "./normalized-credit-book";

export interface RefundMutationContext {
	cardId: string;
	purchaseId: string;
	userId: string;
}
export async function createNormalizedRefund(
	context: RefundMutationContext,
	input: { amount?: number; creditDate: string; policy?: RefundPolicy },
) {
	return mutateCreditBook(context.userId, context.cardId, book =>
		addBookRefund(book, resolveBookPurchase(book, context.purchaseId).id, input),
	);
}
export async function editNormalizedRefund(
	context: RefundMutationContext,
	refundId: string,
	changes: { amount?: number; creditDate?: string },
) {
	return mutateCreditBook(context.userId, context.cardId, book =>
		updateBookRefund(book, resolveBookPurchase(book, context.purchaseId).id, refundId, changes),
	);
}
export async function deleteNormalizedRefund(context: RefundMutationContext, refundId: string) {
	return mutateCreditBook(context.userId, context.cardId, book =>
		removeBookRefund(book, resolveBookPurchase(book, context.purchaseId).id, refundId),
	);
}
