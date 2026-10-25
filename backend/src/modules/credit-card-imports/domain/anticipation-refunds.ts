import { isGenericImportedRefund } from "@zaimu/finance/credit-refund";
import {
	importedAnticipation,
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

export interface AnticipationRefundSource {
	id: string;
	purchaseDate: Date | string;
	totalAmount: number | string;
	installmentAmountsCents: readonly number[];
}

/** Amount comparison classifies compatible operations; unique pairing below prevents guessing. */
function matchesGenericCredit(anticipation: ImportPurchase, credit: ImportPurchase) {
	if (
		!isGenericImportedRefund(withoutImportedAnticipation(credit.description)) ||
		date(credit.purchaseDate) < date(anticipation.purchaseDate)
	)
		return false;
	const parts = importedAnticipation(anticipation.description)!;
	const cents = Math.round(Math.abs(Number(credit.installmentAmount)) * 100);
	return parts.reduce((sum, part) => sum + part.amountCents, 0) <= cents;
}

/** Pair unique compatible operations; ambiguous credits remain separate for review. */
export function anticipationRefundPairs<T extends ImportPurchase>(
	purchases: T[],
	sources: readonly AnticipationRefundSource[] = [],
) {
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
					Math.round(Math.abs(Number(credit.installmentAmount)) * 100) >= amount &&
					(matchesGenericCredit(anticipation, credit) ||
						(merchant(credit.description).length >= 3 &&
							merchant(credit.description) === merchant(anticipation.description) &&
							date(credit.purchaseDate) === date(anticipation.purchaseDate))),
			)
			.map(credit => {
				const matching = sources.filter(
					source =>
						matchesGenericCredit(anticipation, credit) &&
						(!credit.reconciledCreditPurchaseId || source.id === credit.reconciledCreditPurchaseId) &&
						(!anticipation.reconciledCreditPurchaseId ||
							source.id === anticipation.reconciledCreditPurchaseId) &&
						source.installmentAmountsCents.length >= installments.length &&
						date(source.purchaseDate) === date(anticipation.purchaseDate) &&
						Math.round(Number(source.totalAmount) * 100) ===
							Math.round(Math.abs(Number(credit.installmentAmount)) * 100),
				);
				return {
					anticipation,
					credit,
					installments,
					sourceId: matching.length === 1 ? matching[0]!.id : undefined,
				};
			});
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

/** Preserve installment evidence for reconciliation, without imposing a cancellation policy. */
export function combineAnticipationRefunds<T extends ImportPurchase>(
	purchases: T[],
	sources: readonly AnticipationRefundSource[] = [],
): T[] {
	const pairs = anticipationRefundPairs(purchases, sources);
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
						reconciledCreditPurchaseId:
							p.reconciledCreditPurchaseId ?? pair.anticipation.reconciledCreditPurchaseId ?? pair.sourceId,
						totalAmount: -Math.abs(Number(p.installmentAmount)),
					}
				: p;
		});
}
