interface RefundSource {
	id: string;
	description: string;
	purchaseDate: string;
	refundableAmount: number;
	totalAmount: number;
}

const merchant = (value: string) =>
	value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/gu, "")
		.toLowerCase()
		.replace(/^(?:reembolso|estorno|credito)\s*[-:]?\s*/u, "")
		.replace(/\s+bra$/u, "")
		.replace(/[^a-z0-9]/gu, "");

/** Suggest only an exact, unique full refund. Partial or ambiguous credits require a choice. */
export function matchingRefundSource(
	item: { description: string; purchaseDate: string; installmentAmount: number },
	sources: RefundSource[],
) {
	const cents = Math.round(Math.abs(item.installmentAmount) * 100);
	const matches = sources.filter(
		source =>
			merchant(source.description).length >= 3 &&
			merchant(source.description) === merchant(item.description) &&
			source.purchaseDate.slice(0, 10) === item.purchaseDate.slice(0, 10) &&
			Math.round(source.totalAmount * 100) === cents &&
			Math.round(source.refundableAmount * 100) >= cents,
	);
	return matches.length === 1 ? matches[0] : undefined;
}
