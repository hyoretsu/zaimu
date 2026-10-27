import {
	type RecurrenceAssociationTarget,
	recurrenceDateKey,
	validateRecurrenceAssociation,
} from "@zaimu/finance/recurrence";
import { HttpException } from "~/shared/errors";
import { withRawTransaction } from "~/shared/infra/sql";
import type { AssociateRecurrenceBody } from "../infra/elysia/RecurrenceDTO";
import { getRecurrencePeriodOccurrence } from "./recurrence-period-occurrence";
import { getStoredRecurrence } from "./recurrences";

/** Reserve the same key as materialization while keeping every existing financial reference. */
export async function associateRecurrence(userId: string, id: string, input: AssociateRecurrenceBody) {
	return withRawTransaction(async query => {
		const recurrence = await getStoredRecurrence(userId, id, true);
		const purchase = input.kind === "PURCHASE";
		if (purchase) {
			// Same lock order as recurrence materialization and credit-book writers.
			await query('SELECT "id" FROM "CreditCard" WHERE "id"=$1 FOR UPDATE', [recurrence.creditCardId]);
		}
		const table = purchase ? "CreditPurchaseRecord" : "Transaction";
		const [row] = await query<RecurrenceAssociationTarget>(
			`SELECT *, "recurrenceOccurrenceDate"::text AS "recurrenceOccurrenceDate" FROM "${table}" WHERE ("id"=$1${purchase ? ' OR "id"=(SELECT "purchaseId" FROM "CreditEntryReference" WHERE "id"=$1 AND "refundId" IS NULL AND "chargeId" IS NULL)' : ""}) AND "userId"=$2 FOR UPDATE`,
			[input.recordId, userId],
		);
		if (!row) throw new HttpException("Lançamento não encontrado.", 404);
		try {
			validateRecurrenceAssociation(recurrence, { ...row, kind: input.kind }, input.date);
		} catch (error) {
			throw new HttpException((error as Error).message, 400);
		}
		const occurrence = await getRecurrencePeriodOccurrence(recurrence, input.date);
		const [reserved] = occurrence
			? []
			: await query(
					'INSERT INTO "RecurrenceOccurrence" ("recurrenceId","date","transactionId","purchaseId") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING "recurrenceId"',
					[id, input.date, purchase ? null : row.id, purchase ? row.id : null],
				);
		if (!reserved) {
			const existing = occurrence ?? (await getRecurrencePeriodOccurrence(recurrence, input.date));
			if (
				!existing ||
				existing.deletedAt ||
				(purchase ? existing.purchaseId : existing.transactionId) !== row.id
			)
				throw new HttpException("Este período já foi processado. Escolha outro período.", 409);
			return { success: true as const };
		}
		// Unique occurrence indexes also reject inconsistent legacy links without creating a second record.
		await query(
			`UPDATE "${table}" SET "recurrenceId"=$1,"recurrenceOccurrenceDate"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3 AND "userId"=$4`,
			[id, recurrenceDateKey(input.date), row.id, userId],
		);
		return { success: true as const };
	});
}
