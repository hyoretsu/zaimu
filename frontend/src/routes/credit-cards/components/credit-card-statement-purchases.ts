import type { CreditPurchase } from "@/lib/api";

export function isVisibleStatementPurchase(purchase: Pick<CreditPurchase, "isRefund" | "installmentAmount">) {
	return !purchase.isRefund || purchase.installmentAmount < 0;
}
