import { mutateCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { queryRaw } from "~/shared/infra/sql";
export async function deleteLinkedRecurrencePurchases(recurrenceId: string, userId: string) {
	const purchases = await queryRaw<{ id: string; creditCardId: string }>(
		'SELECT "id","creditCardId" FROM "CreditPurchaseRecord" WHERE "recurrenceId"=$1 AND "userId"=$2',
		[recurrenceId, userId],
	);
	for (const cardId of [...new Set(purchases.map(p => p.creditCardId))].sort())
		await mutateCreditBook(userId, cardId, book => {
			const ids = new Set(purchases.filter(p => p.creditCardId === cardId).map(p => p.id));
			book.purchases = book.purchases.filter(p => !ids.has(p.id));
			book.installments = book.installments.filter(i => !ids.has(i.purchaseId));
			book.refunds = book.refunds.filter(r => !ids.has(r.purchaseId));
		});
	return purchases.length;
}
