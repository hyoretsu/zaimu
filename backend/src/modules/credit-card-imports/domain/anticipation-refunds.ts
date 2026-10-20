import {
	importedAnticipation,
	matchingAnticipatedTail,
	withImportedAnticipation,
	withoutImportedAnticipation,
} from "@zaimu/finance/imported-anticipation";

interface ImportPurchase {
	description: string;
	installmentAmount: number | string;
	installments: number;
	purchaseDate: Date | string;
	totalAmount: number | string;
	reconciledCreditPurchaseId?: string | null;
}

const merchant = (description: string) =>
	withoutImportedAnticipation(description)
		.replace(/^\[import-source:[a-zA-Z0-9-]+\] /u, "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/gu, "")
		.toLowerCase()
		.replace(/^(?:reembolso|estorno|credito)\s*[-:]?\s*/u, "")
		.replace(/\s+bra$/u, "")
		.replace(/[^a-z0-9]/gu, "");
const compatibleSources = (a: ImportPurchase, b: ImportPurchase) => {
	if (
		a.reconciledCreditPurchaseId &&
		b.reconciledCreditPurchaseId &&
		a.reconciledCreditPurchaseId !== b.reconciledCreditPurchaseId
	)
		return false;
	const pendingA = a.description.match(/^\[import-source:([a-zA-Z0-9-]+)\] /u)?.[1];
	const pendingB = b.description.match(/^\[import-source:([a-zA-Z0-9-]+)\] /u)?.[1];
	return !pendingA || !pendingB || pendingA === pendingB;
};
const date = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

/** Pair a unique merchant/date when bank credit covers the anticipated installments. */
export function anticipationRefundPairs<T extends ImportPurchase>(purchases: T[]) {
	const anticipations = purchases.filter(
		p => Number(p.installmentAmount) > 0 && importedAnticipation(p.description),
	);
	const credits = purchases.filter(
		p => Number(p.installmentAmount) < 0 && !importedAnticipation(p.description),
	);
	const matches = anticipations.flatMap(anticipation => {
		const installments = importedAnticipation(anticipation.description)!;
		const amount = installments.reduce((sum, part) => sum + part.amountCents, 0);
		return credits
			.filter(
				credit =>
					compatibleSources(anticipation, credit) &&
					merchant(credit.description).length >= 3 &&
					merchant(credit.description) === merchant(anticipation.description) &&
					date(credit.purchaseDate) === date(anticipation.purchaseDate) &&
					Math.round(Math.abs(Number(credit.installmentAmount)) * 100) >= amount &&
					Math.round(Math.abs(Number(credit.installmentAmount)) * 100) <=
						Math.round(Math.abs(Number(anticipation.totalAmount)) * 100),
			)
			.map(credit => ({ anticipation, credit, installments }));
	});
	const anticipationCounts = new Map<T, number>();
	const creditCounts = new Map<T, number>();
	for (const pair of matches) {
		anticipationCounts.set(pair.anticipation, (anticipationCounts.get(pair.anticipation) ?? 0) + 1);
		creditCounts.set(pair.credit, (creditCounts.get(pair.credit) ?? 0) + 1);
	}
	return matches.filter(
		pair => anticipationCounts.get(pair.anticipation) === 1 && creditCounts.get(pair.credit) === 1,
	);
}

/** Negative anticipation metadata means an explicit refund cancellation, never a purchase. */
export function combineAnticipationRefunds<T extends ImportPurchase>(purchases: T[]): T[] {
	const pairs = anticipationRefundPairs(purchases);
	const removed = new Set(pairs.map(pair => pair.anticipation));
	const refunds = new Map(pairs.map(pair => [pair.credit, pair]));
	return purchases
		.filter(p => !removed.has(p))
		.map(p => {
			const pair = refunds.get(p);
			return pair
				? {
						...p,
						description: withImportedAnticipation(p.description, pair.installments),
						installments: pair.anticipation.installments,
						totalAmount: -Math.abs(Number(pair.anticipation.totalAmount)),
					}
				: p;
		});
}

/** Preserve the bank's exact offset; never turn cancellation rounding differences into extra credit. */
export function refundCancellationNumbers(
	description: string,
	amountCents: number,
	installmentAmountsCents: readonly number[],
) {
	const parts = importedAnticipation(description);
	if (!parts) return undefined;
	const tail = matchingAnticipatedTail(description, installmentAmountsCents);
	if (tail && parts.reduce((sum, part) => sum + part.amountCents, 0) <= amountCents) return tail;
	if (
		parts.some(part => installmentAmountsCents[part.number - 1] !== part.amountCents) ||
		parts.reduce((sum, part) => sum + part.amountCents, 0) > amountCents
	)
		throw new RangeError(
			"Valores das parcelas não correspondem ao reembolso importado. Revise a compra original.",
		);
	return parts.map(part => part.number);
}
