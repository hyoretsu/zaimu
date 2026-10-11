import { bookRefinancingLinks, type CreditBook } from "@zaimu/finance/credit-book";
import { currencyScale } from "@zaimu/finance/money";
import { calculateDebtSplit } from "~/modules/debts/domain";

/** Transfer principal shares once; financing costs stay with the purchase owner. */
export function transferRefinancingDebtSplits(book: CreditBook, previous: CreditBook) {
	const previousLinks = bookRefinancingLinks(previous);
	const purchases = new Map(book.purchases.map(p => [p.id, p]));
	for (const [id, relation] of bookRefinancingLinks(book)) {
		const sourceId = relation.refinancedFromPurchaseId;
		if (!sourceId || previousLinks.get(id)?.refinancedFromPurchaseId === sourceId) continue;
		const source = purchases.get(sourceId)!;
		const target = purchases.get(id)!;
		if (!source.debtSplitRule) continue;
		const split = calculateDebtSplit(
			source.totalAmountCents / currencyScale(book.card.currency),
			source.debtSplitRule,
			book.card.currency ?? "BRL",
		);
		target.debtSplitRule ??= {
			mode: "FIXED",
			ownerIncluded: true,
			participants: split.participants.map(p => ({
				debtPersonId: p.debtPersonId,
				description: p.description,
				fixedAmount: p.amount,
			})),
		};
		source.debtSplitRule = null;
	}
}
