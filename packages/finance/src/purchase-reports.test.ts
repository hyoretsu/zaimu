import { expect, test } from "bun:test";
import type { CreditPurchase } from "./credit-purchase";
import type { CreditRefund } from "./credit-refund";
import { purchaseSpending, refundCreditEntry } from "./purchase-reports";

const purchase: CreditPurchase = {
	categoryId: "market",
	creditCardId: "card",
	description: "Compras",
	id: "purchase",
	installmentAmountsCents: [10000, 10000, 10000],
	purchaseDate: "2024-08-10",
	storeName: "Mercado",
	tagIds: ["groceries"],
	totalAmountCents: 30000,
};
const refund: CreditRefund = {
	amountCents: 10000,
	cancellationEligible: false,
	creditDate: "2024-09-20",
	creditStatementId: "september",
	id: "refund",
	policy: "KEEP_INSTALLMENTS",
	purchaseId: purchase.id,
};

test("net spending belongs to purchase period; cash credit belongs to refund cycle", () => {
	expect(purchaseSpending(purchase, [refund])).toMatchObject({
		date: "2024-08-10",
		grossAmountCents: 30000,
		netAmountCents: 20000,
		storeName: "Mercado",
		tagIds: ["groceries"],
	});
	expect(
		refundCreditEntry(purchase, refund, {
			canceledAmountCents: 0,
			canceledInstallmentNumbers: [],
			creditAmountCents: 10000,
			refundId: refund.id,
		}),
	).toMatchObject({
		amountCents: 10000,
		date: "2024-09-20",
		kind: "REFUND",
		statementId: "september",
		storeName: "Mercado",
	});
});
