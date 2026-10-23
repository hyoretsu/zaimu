import { distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import {
	hasMatchingInstallmentSum,
	importReconciliationToleranceCents,
	isGenericImportedRefund,
	matchingGenericRefundSource,
} from "@zaimu/finance/credit-refund";
import {
	importedAnticipation,
	matchingAnticipatedTail,
	withoutImportedAnticipation,
} from "@zaimu/finance/imported-anticipation";

interface RefundSource {
	id: string;
	description: string;
	purchaseDate: string;
	refundableAmount: number;
	installments?: number;
	installmentAmountsCents?: readonly number[];
	totalAmount: number;
}

const merchant = (value: string) =>
	withoutImportedAnticipation(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/gu, "")
		.toLowerCase()
		.replace(/^(?:reembolso|estorno|credito)\s*[-:]?\s*/u, "")
		.replace(/\s+bra$/u, "")
		.replace(/[^a-z0-9]/gu, "");

/** Suggest a unique original by its full total, including explicit installment cancellations. */
export function matchingRefundSource(
	item: {
		description: string;
		purchaseDate: string;
		installmentAmount: number;
		totalAmount?: number;
		installments?: number;
	},
	sources: RefundSource[],
) {
	const cancellation = importedAnticipation(item.description);
	const cents = Math.round(Math.abs(item.installmentAmount) * 100);
	const eligible = eligibleRefundSources(item, sources);
	if (cancellation) {
		// Eligibility permits approximate sums; automatic cancellation still requires an exact plan.
		const exact = eligible.filter(
			source =>
				Math.round(source.refundableAmount * 100) >= cents &&
				Boolean(
					matchingAnticipatedTail(
						item.description,
						source.installmentAmountsCents ??
							distributePurchaseCents(Math.round(source.totalAmount * 100), source.installments ?? 1),
					),
				),
		);
		return eligible.length === 1 && exact.length === 1 ? exact[0] : undefined;
	}
	if (isGenericImportedRefund(item.description)) return matchingGenericRefundSource(item, eligible);
	const matches = eligible.filter(
		source =>
			Math.round(source.totalAmount * 100) === cents &&
			merchant(source.description).length >= 3 &&
			merchant(source.description) === merchant(item.description) &&
			source.purchaseDate.slice(0, 10) === item.purchaseDate.slice(0, 10),
	);
	return matches.length === 1 ? matches[0] : undefined;
}

/** Filter before search and auto-selection so hidden incompatible plans cannot be linked. */
export function eligibleRefundSources<T extends RefundSource>(
	item: { description: string; installmentAmount: number },
	sources: T[],
) {
	const cents = Math.round(Math.abs(item.installmentAmount) * 100);
	return sources.filter(source => {
		if (Math.round(source.refundableAmount * 100) + importReconciliationToleranceCents < cents) return false;
		const amounts =
			source.installmentAmountsCents ??
			distributePurchaseCents(Math.round(source.totalAmount * 100), source.installments ?? 1);
		return hasMatchingInstallmentSum(amounts, cents);
	});
}
