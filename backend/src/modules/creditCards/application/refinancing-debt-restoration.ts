import { bookRefinancingLinks, type CreditBook } from "@zaimu/finance/credit-book";
import { currencyScale } from "@zaimu/finance/money";
import { calculateDebtSplit } from "~/modules/debts/domain";

/** Restore transferred monetary shares when refinancing descendants are deleted. */
export function restoreRefinancingDebtSplits(book: CreditBook, previous: CreditBook) {
	const previousLinks = bookRefinancingLinks(previous);
	const purchases = new Map(book.purchases.map(p => [p.id, p]));
	const previousPurchases = new Map(previous.purchases.map(p => [p.id, p]));
	for (const source of book.purchases) {
		if (source.debtSplitRule) continue;
		const removedTargets = (previousLinks.get(source.id)?.refinancingPurchaseIds ?? []).filter(
			id => !purchases.has(id) && book.deletedPurchaseIds?.includes(id),
		);
		if (!removedTargets.length) continue;
		const participants = new Map<
			string,
			{ debtPersonId: string; description?: string; fixedAmount: number }
		>();
		const restore = (id: string) => {
			const purchase = previousPurchases.get(id)!;
			if (purchase.debtSplitRule) {
				const split = calculateDebtSplit(
					purchase.totalAmountCents / currencyScale(previous.card.currency),
					purchase.debtSplitRule,
					previous.card.currency ?? "BRL",
				);
				for (const participant of split.participants) {
					const existing = participants.get(participant.debtPersonId);
					participants.set(participant.debtPersonId, {
						debtPersonId: participant.debtPersonId,
						description: existing?.description ?? participant.description,
						fixedAmount: (existing?.fixedAmount ?? 0) + participant.amount,
					});
				}
			}
			for (const child of previousLinks.get(id)?.refinancingPurchaseIds ?? []) restore(child);
		};
		for (const id of removedTargets) restore(id);
		if (participants.size) {
			source.debtSplitRule = { mode: "FIXED", ownerIncluded: true, participants: [...participants.values()] };
		}
	}
}
