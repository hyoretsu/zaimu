import { readCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { db, executeStatement, queryRows } from "~/shared/infra/sql";
import { existingRefundMatches, type RefundMatchItem } from "../domain/existing-refund-matches";

/** Caller holds the card lock; approval still attaches identity and applies any reviewed cancellation. */
export async function reconcileExistingRefunds(userId: string, importId: string, cardId: string) {
	const items: RefundMatchItem[] = await queryRows(
		db.sql.public.CreditCardImportItem.select(
			"id",
			"externalId",
			"installmentAmount",
			"purchaseDate",
			"reconciledCreditPurchaseId",
			"refundReview",
		)
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.creditCardImportId, importId),
					functions.lt(fields.installmentAmount, "0"),
				),
			)
			.build(),
	);
	if (!items.length) return;
	const book = await readCreditBook(userId, cardId);
	for (const [id, refund] of existingRefundMatches(items, book.refunds))
		await executeStatement(
			db.sql.public.CreditCardImportItem.update({
				reconciledCreditPurchaseId: refund.purchaseId,
				refundReview: { policy: refund.policy, purchaseId: refund.purchaseId },
				updatedAt: new Date(),
			})
				.where((fields, functions) =>
					functions.and(functions.eq(fields.id, id), functions.eq(fields.refundReview, null)),
				)
				.build(),
		);
}
