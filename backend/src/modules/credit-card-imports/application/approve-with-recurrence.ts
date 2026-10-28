import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { associateRecurrence } from "~/modules/recurring/application/associate-recurrence";
import { getStoredRecurrence } from "~/modules/recurring/application/recurrences";
import type { ImportRecurrenceDTO } from "~/modules/recurring/infra/elysia/RecurrenceDTO";
import { HttpException } from "~/shared/errors";
import { withRawTransaction } from "~/shared/infra/sql";
import { getFinancingSource, getFinancingTarget } from "../domain/financing-source-reference";
import { approveItems } from "./import-service";

/** Approval and occurrence reservation share a transaction: neither can succeed alone. */
export function approveWithRecurrence(
	userId: string,
	importId: string,
	itemId: string,
	recurrence: ImportRecurrenceDTO,
) {
	return withRawTransaction(async query => {
		// Match recurrence writers' lock order before approval locks the card.
		await getStoredRecurrence(userId, recurrence.recurrenceId, true);
		const [item] = await query<{
			externalId: string;
			creditCardId: string;
			installmentAmount: number;
			isStatementCharge: boolean;
			description: string;
		}>(
			`SELECT i.*, b."creditCardId" FROM "CreditCardImportItem" i JOIN "CreditCardImport" b ON b."id"=i."creditCardImportId" WHERE i."id"=$1 AND b."id"=$2 AND b."userId"=$3 AND b."status"='PENDING' FOR UPDATE OF b, i`,
			[itemId, importId, userId],
		);
		if (!item) throw new HttpException("Compra importada não encontrada", 404);
		if (
			Number(item.installmentAmount) <= 0 ||
			item.isStatementCharge ||
			importedAnticipation(item.description) ||
			getFinancingSource(item.description) ||
			getFinancingTarget(item.description)
		)
			throw new HttpException("Somente compras comuns podem ser associadas a recorrências.", 400);
		const result = await approveItems(userId, importId, itemId);
		const [purchase] = await query<{ id: string }>(
			`SELECT p."id" FROM "CreditPurchaseImportIdentity" i JOIN "CreditPurchaseRecord" p ON p."id"=i."purchaseId" WHERE i."externalId"=$1 AND p."creditCardId"=$2 AND p."userId"=$3`,
			[item.externalId, item.creditCardId, userId],
		);
		if (!purchase || result.created !== 1)
			throw new HttpException("Resolva as pendências antes de associar a compra.", 409);
		await associateRecurrence(userId, recurrence.recurrenceId, {
			date: recurrence.date,
			kind: "PURCHASE",
			recordId: purchase.id,
		});
		return result;
	});
}
