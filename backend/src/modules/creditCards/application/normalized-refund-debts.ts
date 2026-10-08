import {
	type BookPurchase,
	type CreditBook,
	moneyCents,
	refundDebtAmounts,
} from "@zaimu/finance/credit-book";
import { currencyScale } from "@zaimu/finance/money";
import { createDebtEvent } from "~/modules/debts/application";
import { calculateDebtSplit } from "~/modules/debts/domain";
import type { RawQuery } from "./normalized-statement-replay";

/** Refund amount, including canceled installments, reverses the original participant shares. */
export async function syncRefundDebtEvents(query: RawQuery, book: CreditBook, purchase: BookPurchase) {
	let participants: { debtPersonId: string; amount: number }[] = purchase.debtSplitRule
		? calculateDebtSplit(
				purchase.totalAmountCents / currencyScale(book.card.currency),
				purchase.debtSplitRule,
				book.card.currency,
			).participants
		: [];
	if (!purchase.debtSplitRule) {
		const linked = await query<{ debtPersonId: string; amount: number }>(
			`SELECT person."id" AS "debtPersonId",sum(CASE WHEN e."createdByUserId"=$2 THEN e."effect" ELSE -e."effect" END) AS "amount" FROM "DebtPurchaseLink" l JOIN "DebtEvent" e ON e."id"=l."eventId" JOIN "DebtPerson" person ON person."userId"=$2 AND (person."id"=e."debtPersonId" OR (e."connectionId" IS NOT NULL AND person."connectionId"=e."connectionId")) WHERE l."creditPurchaseId"=$1 AND l."userId"=$2 GROUP BY person."id"`,
			[purchase.id, book.card.userId],
		);
		participants = linked
			.filter(p => Number(p.amount) > 0)
			.map(p => ({ amount: Number(p.amount), debtPersonId: p.debtPersonId }));
	}
	let refunded = 0;
	for (const refund of book.refunds
		.filter(row => row.purchaseId === purchase.id)
		.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
		const amounts = refund.deletedAt
			? participants.map(() => 0)
			: refundDebtAmounts(
					purchase.totalAmountCents,
					participants.map(p => moneyCents(p.amount, 1, book.card.currency)),
					refunded,
					refund.amountCents,
				);
		if (!refund.deletedAt) refunded += refund.amountCents;
		const links = await query<{ eventId: string; debtPersonId: string; amount: number }>(
			`SELECT l."eventId", e."debtPersonId", e."amount" FROM "DebtPurchaseLink" l JOIN "DebtEvent" e ON e."id" = l."eventId" WHERE l."creditPurchaseId" = $1 AND l."userId" = $2 AND l."isCreator"`,
			[refund.id, book.card.userId],
		);
		for (const link of links) {
			const index = participants.findIndex(p => p.debtPersonId === link.debtPersonId);
			const amount = index < 0 ? 0 : amounts[index]! / currencyScale(book.card.currency);
			await query(
				`UPDATE "DebtEvent" SET "amount" = $1, "effect" = $2, "date" = $3, "description" = $4, "updatedAt" = CURRENT_TIMESTAMP, "currency" = $6 WHERE "id" = $5`,
				[
					amount || link.amount,
					-amount,
					refund.creditDate,
					`Reembolso - ${purchase.description}`,
					link.eventId,
					book.card.currency ?? "BRL",
				],
			);
		}
		for (const [index, participant] of participants.entries()) {
			const amount = amounts[index]! / currencyScale(book.card.currency);
			if (!amount || links.some(link => link.debtPersonId === participant.debtPersonId)) continue;
			const event = await createDebtEvent({
				amount,
				createdByUserId: book.card.userId,
				currency: book.card.currency ?? "BRL",
				date: refund.creditDate,
				debtPersonId: participant.debtPersonId,
				description: `Reembolso - ${purchase.description}`,
				effect: -amount,
				kind: "PURCHASE",
			});
			await query(
				`INSERT INTO "DebtPurchaseLink" ("eventId","creditPurchaseId","userId","isCreator") VALUES ($1,$2,$3,true)`,
				[event.id, refund.id, book.card.userId],
			);
		}
	}
}
