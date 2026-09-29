import { withImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import type { CreditCardStatementPurchase } from "./credit-card-statement";

/** Multiple distinct installment numbers in one statement belong to one purchase. */
export function groupAnticipatedInstallments(purchases: CreditCardStatementPurchase[]) {
	const groups = new Map<string, number[][]>();
	for (const [index, purchase] of purchases.entries()) {
		if (
			purchase.installments <= 1 ||
			purchase.installmentAmount <= 0 ||
			purchase.description.startsWith("FIN ")
		)
			continue;
		const key = JSON.stringify([
			purchase.statementPurchaseDate ?? purchase.purchaseDate,
			purchase.description.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR"),
			purchase.installments,
		]);
		const candidates = groups.get(key) ?? [];
		// A repeated number starts another purchase, even with the same merchant and date.
		let group = candidates.at(-1);
		if (!group || group.some(i => purchases[i]!.currentInstallment === purchase.currentInstallment)) {
			group = [];
			candidates.push(group);
		}
		group.push(index);
		groups.set(key, candidates);
	}
	const replacements = new Map<number, CreditCardStatementPurchase>();
	const removed = new Set<number>();
	for (const candidates of groups.values())
		for (const indexes of candidates) {
			if (indexes.length < 2) continue;
			const ordered = indexes
				.map(i => purchases[i]!)
				.toSorted((a, b) => a.currentInstallment - b.currentInstallment);
			const first = ordered[0]!;
			const knownCents = ordered.reduce((sum, p) => sum + Math.round(p.installmentAmount * 100), 0);
			const remaining = first.installments - ordered.length;
			replacements.set(indexes[0]!, {
				...first,
				description: withImportedAnticipation(
					first.description,
					ordered.map(p => ({
						amountCents: Math.round(p.installmentAmount * 100),
						number: p.currentInstallment,
					})),
				),
				totalAmount: (knownCents + remaining * Math.round(first.installmentAmount * 100)) / 100,
			});
			for (const index of indexes.slice(1)) removed.add(index);
		}
	const originalToGrouped = new Map<number, number>();
	const result: CreditCardStatementPurchase[] = [];
	for (const [index, purchase] of purchases.entries()) {
		if (removed.has(index)) continue;
		originalToGrouped.set(index, result.length);
		const { statementPurchaseDate: _, ...value } = replacements.get(index) ?? purchase;
		result.push(value);
	}
	return result.map(purchase =>
		purchase.financingSourceIndex === undefined
			? purchase
			: {
					...purchase,
					financingSourceIndex: originalToGrouped.get(purchase.financingSourceIndex),
				},
	);
}
