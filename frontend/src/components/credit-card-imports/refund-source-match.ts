import { importedAnticipation, withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";

interface RefundSource {
	id: string;
	description: string;
	purchaseDate: string;
	refundableAmount: number;
	installments?: number;
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
	const originalCents =
		cancellation && item.totalAmount !== undefined ? Math.round(Math.abs(item.totalAmount) * 100) : null;
	const cents = Math.round(Math.abs(item.installmentAmount) * 100);
	const eligible = sources.filter(
		source =>
			Math.round(source.totalAmount * 100) === (originalCents ?? cents) &&
			Math.round(source.refundableAmount * 100) >= cents,
	);
	if (cancellation && item.installments) {
		const matches = eligible.filter(
			source =>
				source.installments === item.installments &&
				source.purchaseDate.slice(0, 10) <= item.purchaseDate.slice(0, 10) &&
				cancellation.every(part => part.number >= 1 && part.number <= source.installments!),
		);
		// Explicit cancellation identifies the plan even when banks print the credit date/name differently.
		return matches.length === 1 ? matches[0] : undefined;
	}
	const matches = eligible.filter(
		source =>
			merchant(source.description).length >= 3 &&
			merchant(source.description) === merchant(item.description) &&
			source.purchaseDate.slice(0, 10) === item.purchaseDate.slice(0, 10),
	);
	return matches.length === 1 ? matches[0] : undefined;
}
