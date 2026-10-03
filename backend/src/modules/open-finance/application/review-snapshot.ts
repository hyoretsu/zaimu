import { executeRaw, queryRaw } from "~/shared/infra/sql";
import type { NormalizedRecord } from "../domain/normalize";
import { sameSnapshot } from "./local-snapshot";

export async function reviewSnapshot(itemId: string, card: boolean) {
	const table = card ? "CreditCardImportItem" : "TransactionImportItem";
	const debtColumn = card ? "creditCardImportItemId" : "transactionImportItemId";
	const [row] = await queryRaw<{ snapshot: Record<string, unknown> }>(
		`SELECT jsonb_build_object('review', to_jsonb(i), 'calendar', ${card ? `(SELECT jsonb_build_object('statementDate',b."statementDate",'dueDate',b."dueDate") FROM "CreditCardImport" b WHERE b."id"=i."creditCardImportId")` : `'null'::jsonb`}, 'tags', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t."id") FROM "TagAssignment" t WHERE t."entityId"=i."id"), '[]'::jsonb), 'debt', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d."id") FROM "DebtSplit" d WHERE d."${debtColumn}"=i."id"), '[]'::jsonb)) AS snapshot FROM "${table}" i WHERE i."id"=$1 FOR UPDATE OF i`,
		[itemId],
	);
	return row?.snapshot ?? null;
}
export async function refreshUntouchedReview(
	record: { id: string; reviewItemId: string | null; appliedSnapshot: Record<string, unknown> | null },
	remote: NormalizedRecord,
) {
	if (!record.reviewItemId || !record.appliedSnapshot?.review) return;
	const card = "creditCardImportId" in (record.appliedSnapshot.review as Record<string, unknown>);
	if (!sameSnapshot(await reviewSnapshot(record.reviewItemId, card), record.appliedSnapshot)) return;
	if (card) {
		await executeRaw(
			`UPDATE "CreditCardImportItem" SET "purchaseDate"=$2, "time"=$3, "description"=$4, "totalAmount"=$5, "installments"=$6, "currentInstallment"=$7, "installmentAmount"=$8, "isStatementCharge"=$9, "metadataMissing"=$10::jsonb, "updatedAt"=now() WHERE "id"=$1`,
			[
				record.reviewItemId,
				remote.date,
				remote.time,
				remote.description.slice(0, 500),
				remote.totalAmount ?? 0,
				Math.max(1, remote.installments),
				Math.max(1, remote.installmentNumber),
				remote.amount,
				remote.operation === "CHARGE",
				JSON.stringify(remote.incomplete),
			],
		);
		await executeRaw(
			`UPDATE "CreditCardImport" b SET "statementDate"=$2, "dueDate"=$3 FROM "CreditCardImportItem" i WHERE i."id"=$1 AND b."id"=i."creditCardImportId"`,
			[record.reviewItemId, remote.statementDate ?? remote.date, remote.dueDate ?? remote.date],
		);
	} else {
		await executeRaw(
			`UPDATE "TransactionImportItem" SET "amount"=$2, "date"=$3, "time"=$4, "description"=$5, "type"=$6, "originFinancialAccountId"=$7, "destinationFinancialAccountId"=$8, "updatedAt"=now() WHERE "id"=$1`,
			[
				record.reviewItemId,
				Math.abs(remote.amount),
				remote.date,
				remote.time,
				remote.description.slice(0, 1000),
				remote.amount < 0 ? "EXPENSE" : "INCOME",
				remote.amount < 0
					? ((record.appliedSnapshot.review as Record<string, unknown>).originFinancialAccountId ??
						(record.appliedSnapshot.review as Record<string, unknown>).destinationFinancialAccountId)
					: null,
				remote.amount >= 0
					? ((record.appliedSnapshot.review as Record<string, unknown>).originFinancialAccountId ??
						(record.appliedSnapshot.review as Record<string, unknown>).destinationFinancialAccountId)
					: null,
			],
		);
	}
	await executeRaw(`UPDATE "OpenFinanceRecord" SET "appliedSnapshot"=$2::jsonb WHERE "id"=$1`, [
		record.id,
		JSON.stringify(await reviewSnapshot(record.reviewItemId, card)),
	]);
}
