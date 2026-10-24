import {
	addBookRefund,
	type BookRefund,
	type CreditBook,
	updateBookRefund,
} from "@zaimu/finance/credit-book";

interface ImportedRefund {
	amount: number;
	creditDate: string;
	externalId: string;
	canceledInstallmentNumbers?: number[];
	policy?: "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS";
}

/** An exact manual refund can acquire a bank identity only through explicit review. */
export function existingImportedRefund(
	refunds: readonly BookRefund[],
	purchaseId: string,
	input: ImportedRefund,
) {
	const matches = refunds.filter(
		refund =>
			!refund.deletedAt &&
			refund.purchaseId === purchaseId &&
			refund.creditDate === input.creditDate &&
			refund.amountCents === Math.round(input.amount * 100) &&
			(!refund.externalId || refund.externalId === input.externalId),
	);
	return matches.length === 1 ? matches[0] : undefined;
}

export function approveImportedRefund(book: CreditBook, purchaseId: string, input: ImportedRefund) {
	const existing = existingImportedRefund(book.refunds, purchaseId, input);
	if (!existing) {
		const refund = addBookRefund(book, purchaseId, input);
		refund.externalId = input.externalId;
		return refund;
	}
	if (input.canceledInstallmentNumbers?.length)
		updateBookRefund(book, purchaseId, existing.id, {
			canceledInstallmentNumbers: input.canceledInstallmentNumbers,
		});
	existing.externalId = input.externalId;
	existing.updatedAt = new Date().toISOString();
	return existing;
}
