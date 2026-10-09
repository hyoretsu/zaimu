import type { CreditBook } from "@zaimu/finance/credit-book";

export const equalBookValue = (left: unknown, right: unknown) =>
	JSON.stringify(left) === JSON.stringify(right);

/** Snapshots come from the locked book. Missing/changed records alone require persistence. */
export function creditBookDelta(book: CreditBook, previous: CreditBook) {
	const changed = <T extends { id: string }>(next: T[], before: T[]) => {
		const byId = new Map(before.map(row => [row.id, row]));
		return next.filter(row => !equalBookValue(row, byId.get(row.id)));
	};
	const purchases = changed(book.purchases, previous.purchases);
	const installments = changed(book.installments, previous.installments);
	const refunds = changed(book.refunds, previous.refunds);
	const charges = changed(book.charges, previous.charges);
	const statements = changed(book.statements, previous.statements);
	// A newly materialized occurrence may activate a purchase's debt even if principal is unchanged.
	const debtPurchaseIds = new Set([
		...purchases.map(row => row.id),
		...installments.map(row => row.purchaseId),
		...refunds.map(row => row.purchaseId),
	]);
	return { charges, debtPurchaseIds, installments, purchases, refunds, statements };
}
