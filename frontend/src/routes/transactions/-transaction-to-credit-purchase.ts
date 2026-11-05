import { isCryptoAsset } from "@zaimu/finance/money";
import type { CreditPurchase, Transaction } from "@/lib/api";

export const transactionToCreditPurchase = (transaction: Transaction): CreditPurchase => {
	if (isCryptoAsset(transaction.bookingCurrency ?? transaction.currency ?? "BRL"))
		throw new Error("Compras no cartão exigem moeda fiduciária");
	return {
		bookingCurrency: transaction.bookingCurrency,
		creditCardId: transaction.creditCardId ?? undefined,
		currency: transaction.currency,
		currentInstallment: transaction.currentInstallment ?? 1,
		debtSplit: transaction.debtSplit,
		description: transaction.description ?? "",
		exchangeRate:
			transaction.exchangeRate == null ? transaction.exchangeRate : Number(transaction.exchangeRate),
		feeAmount: transaction.feeAmount == null ? transaction.feeAmount : Number(transaction.feeAmount),
		feeDescription: transaction.feeDescription,
		fees: transaction.fees,
		hasRefund: transaction.hasRefund,
		id: transaction.isSynced && transaction.parentId ? transaction.parentId : transaction.id,
		installmentAmount: Number(transaction.installmentAmount ?? transaction.amount),
		installments: transaction.installments ?? 1,
		isFullySynced: transaction.isFullySynced,
		isRefund: transaction.isRefund,
		isSynced: transaction.isSynced,
		originalAmount:
			transaction.originalAmount == null
				? transaction.originalAmount
				: Number(transaction.originalAmount),
		parentId: transaction.isSynced ? undefined : (transaction.parentId ?? undefined),
		purchaseDate: transaction.date,
		refund: transaction.refund,
		refundOfPurchaseId: transaction.refundOfPurchaseId,
		statementId: transaction.statementId ?? "",
		storeName: transaction.storeName,
		tagIds: transaction.tagIds,
		tags: transaction.tags,
		time: transaction.time,
		totalAmount: Number(transaction.amount),
	};
};
