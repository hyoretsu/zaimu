import {
	addBookRefund,
	type BookRefund,
	type CreditBook,
	updateBookRefund,
} from "@zaimu/finance/credit-book";

import { HttpException } from "../../../shared/errors/HttpException";

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
	const identified = refunds.find(refund => !refund.deletedAt && refund.externalId === input.externalId);
	if (identified)
		return !identified.deletedAt &&
			identified.purchaseId === purchaseId &&
			identified.creditDate === input.creditDate &&
			identified.amountCents === Math.round(input.amount * 100)
			? identified
			: undefined;
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
	const purchase = book.purchases.find(purchase => purchase.id === purchaseId);
	if (purchase && purchase.purchaseDate > input.creditDate)
		throw new HttpException("A compra original não pode ser posterior ao reembolso", 400);
	const existing = existingImportedRefund(book.refunds, purchaseId, input);
	if (!existing && book.refunds.some(refund => !refund.deletedAt && refund.externalId === input.externalId))
		throw new HttpException(
			"Este crédito importado já está vinculado a outro reembolso. Revise o reembolso existente",
			409,
		);
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
