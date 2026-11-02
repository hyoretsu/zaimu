import { t } from "elysia";
import { createTransactionBatch } from "~/modules/transaction-imports/application/import-batches";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { filterExistingTransactions } from "../domain/filter-existing-transactions";
import { filterZeroValueTransactions } from "../domain/filter-zero-value-transactions";
import { assignStableExternalIds, statementImportId } from "../domain/statement-identity";
import { parseStatementPdf } from "../domain/statement-parser";

const toDateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
type ImportItemType = "INCOME" | "EXPENSE" | "TRANSFER" | "YIELD";

export const CreateTransactionImportBody = t.Object({
	file: t.File(),
	financialAccountId: t.String({ maxLength: 36, minLength: 1 }),
	provider: t.Union([
		t.Literal("MERCADO_PAGO"),
		t.Literal("NUBANK"),
		t.Literal("BANCO_DO_BRASIL"),
		t.Literal("INTER"),
		t.Literal("PICPAY"),
	]),
});

export async function createUploadedTransactionImport(
	userId: string,
	body: typeof CreateTransactionImportBody.static,
	guard?: () => Promise<void>,
	complete?: (result: { importId: string | null; ignoredCount: number }) => Promise<void>,
) {
	if (body.file.type !== "application/pdf" && !body.file.name.toLowerCase().endsWith(".pdf"))
		throw new HttpException("Envie um arquivo PDF", 400);
	const fileBytes = new Uint8Array(await body.file.arrayBuffer());
	if (fileBytes.length < 5 || new TextDecoder().decode(fileBytes.slice(0, 5)) !== "%PDF-")
		throw new HttpException("Envie um PDF válido", 400);
	const statement = await parseStatementPdf(fileBytes.buffer, body.provider);
	const statementTransactions = assignStableExternalIds(
		filterZeroValueTransactions(statement.transactions),
		{
			financialAccountId: body.financialAccountId,
			provider: statement.provider,
			userId,
		},
	);
	const importId = statementImportId(
		userId,
		body.financialAccountId,
		statement.provider,
		statementTransactions.map(item => item.externalId),
	);
	return withRawTransaction(async query => {
		await guard?.();
		const result = await (async () => {
			await query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
				`statement-import:${userId}:${body.financialAccountId}`,
			]);
			const imported = await query<{ id: string; status: string }>(
				'SELECT "id", "status" FROM "TransactionImport" WHERE "id"=$1',
				[importId],
			);
			if (imported[0])
				return {
					ignoredCount: imported[0].status === "PENDING" ? 0 : statementTransactions.length,
					transactionImport: imported[0].status === "PENDING" ? { id: imported[0].id } : null,
				};

			const [existingTransactions, existingYields] = await Promise.all([
				queryRaw<{ externalId: string | null }>(
					`SELECT "externalId" FROM "TransactionExternalReference" WHERE "financialAccountId"=$1 AND "externalId"=ANY($2::varchar[])`,
					[
						body.financialAccountId,
						statementTransactions.map(transaction => transaction.externalId),
					],
				),
				queryRaw<{ externalId: string | null }>(
					`SELECT "externalId" FROM "FinancialAccountYield" WHERE "financialAccountId"=$1 AND "externalId"=ANY($2::varchar[])`,
					[
						body.financialAccountId,
						statementTransactions.map(transaction => transaction.externalId),
					],
				),
			]);
			const existingExternalIds = new Set(
				[...existingTransactions, ...existingYields].flatMap(transaction =>
					transaction.externalId ? [transaction.externalId] : [],
				),
			);
			const transactions = filterExistingTransactions(statementTransactions, existingExternalIds);
			const ignoredCount = statementTransactions.length - transactions.length;
			if (transactions.length === 0) return { ignoredCount, transactionImport: null };
			const pending = await queryRaw<{ id: string }>(
				`SELECT b."id" FROM "TransactionImport" b
				 WHERE b."userId"=$1 AND b."financialAccountId"=$2 AND b."provider"=$3 AND b."status"='PENDING'
				 AND EXISTS (SELECT 1 FROM "TransactionImportItem" i WHERE i."transactionImportId"=b."id")
				 AND NOT EXISTS (SELECT 1 FROM "TransactionImportItem" i WHERE i."transactionImportId"=b."id" AND (i."externalId" IS NULL OR NOT (i."externalId"=ANY($4::varchar[]))))
				 AND NOT EXISTS (SELECT 1 FROM unnest($4::varchar[]) e WHERE NOT EXISTS (SELECT 1 FROM "TransactionImportItem" i WHERE i."transactionImportId"=b."id" AND i."externalId"=e))
				 ORDER BY b."createdAt" LIMIT 1`,
				[
					userId,
					body.financialAccountId,
					statement.provider,
					transactions.map(item => item.externalId),
				],
			);
			const existing = pending[0];
			if (existing) return { ignoredCount, transactionImport: { id: existing.id } };

			const transactionImport = await createTransactionBatch({
				fileName: body.file.name.slice(0, 255),
				financialAccountId: body.financialAccountId,
				id: importId,
				periodEnd: statement.periodEnd ? new Date(statement.periodEnd) : undefined,
				periodStart: statement.periodStart ? new Date(statement.periodStart) : undefined,
				provider: statement.provider,
				userId,
			});
			if (!transactionImport) throw new HttpException("Não foi possível criar a importação", 500);
			await executeStatement(
				db.sql.public.TransactionImportItem.insert(
					transactions.map(transaction => ({
						amount: String(transaction.amount),
						balanceAfter:
							transaction.balanceAfter === undefined
								? undefined
								: String(transaction.balanceAfter),
						date: new Date(transaction.date),
						description: transaction.description,
						destinationFinancialAccountId:
							transaction.type === "INCOME" || transaction.type === "YIELD"
								? body.financialAccountId
								: undefined,
						externalId: transaction.externalId,
						originFinancialAccountId:
							transaction.type === "EXPENSE" ? body.financialAccountId : undefined,
						time: transaction.time,
						transactionImportId: transactionImport.id,
						type: transaction.type as ImportItemType,
					})),
				).build(),
			);
			return {
				ignoredCount,
				transactionImport: { id: transactionImport.id },
			};
		})();
		await complete?.({
			ignoredCount: result.ignoredCount,
			importId: result.transactionImport?.id ?? null,
		});
		return result;
	});
}
