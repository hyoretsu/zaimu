import { readCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { queryRaw } from "~/shared/infra/sql";
import { existingRefundMatches, type RefundMatchItem } from "../domain/existing-refund-matches";

/** Caller holds the card lock; approval still attaches identity and applies any reviewed cancellation. */
export async function reconcileExistingRefunds(userId: string, importId: string, cardId: string) {
	const items = await queryRaw<RefundMatchItem>(
		`SELECT * FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1 AND "installmentAmount"<0`,
		[importId],
	);
	if (!items.length) return;
	const book = await readCreditBook(userId, cardId);
	for (const [id, refund] of existingRefundMatches(items, book.refunds))
		await queryRaw(
			`UPDATE "CreditCardImportItem" SET "reconciledCreditPurchaseId"=$2, "refundReview"=$3::json, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "refundReview" IS NULL`,
			[id, refund.purchaseId, JSON.stringify({ policy: refund.policy, purchaseId: refund.purchaseId })],
		);
}
