import { assertBalanceAccountOwnership } from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import { financialAccountCurrency } from "~/modules/currencies/application/financial-money";
import { settleExternalReview } from "~/modules/open-finance/application/review-tracking";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { HttpException } from "~/shared/errors";
import { db, queryFirst, queryRaw, queryRows, type SqlExecutor } from "~/shared/infra/sql";
import { importedMoney } from "./imported-money";

const importItemTagEntityType = "TRANSACTION_IMPORT_ITEM";
type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";
type ImportItemType = TransactionType | "YIELD";
export async function validateItemAccounts(
	item: {
		destinationFinancialAccountId: string | null;
		originFinancialAccountId: string | null;
		type: ImportItemType;
	},
	userId: string,
) {
	if (item.type === "INCOME" || item.type === "YIELD") {
		if (!item.destinationFinancialAccountId) throw new HttpException("Selecione a conta de destino", 400);
		await assertBalanceAccountOwnership(item.destinationFinancialAccountId, userId);
		return;
	}
	if (!item.originFinancialAccountId) throw new HttpException("Selecione a conta de origem", 400);
	await assertBalanceAccountOwnership(item.originFinancialAccountId, userId, { allowCashback: true });
	if (item.type === "TRANSFER") {
		if (!item.destinationFinancialAccountId) throw new HttpException("Selecione a conta de destino", 400);
		if (item.destinationFinancialAccountId === item.originFinancialAccountId)
			throw new HttpException("Escolha contas diferentes para a transferência", 400);
		await assertBalanceAccountOwnership(item.destinationFinancialAccountId, userId);
	}
}

export async function assertCreditCardStatementOwnership(paymentCreditCardId: string, userId: string) {
	const card = await queryFirst(
		db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (f, fn) =>
			fn.eq(f.CreditCard.financialAccountId, f.FinancialAccount.id),
		)
			.select(f => ({ id: f.CreditCard.id }))
			.where((f, fn) =>
				fn.and(fn.eq(f.CreditCard.id, paymentCreditCardId), fn.eq(f.FinancialAccount.userId, userId)),
			)
			.build(),
	);
	if (!card) throw new HttpException("Cartão não encontrado", 404);
}

export interface ImportItemToApprove {
	amount: number;
	paymentCreditCardId: string | null;
	date: Date;
	description: string | null;
	destinationFinancialAccountId: string | null;
	externalId: string | null;
	id: string;
	isHidden: boolean;
	isReconciled: boolean;
	originFinancialAccountId: string | null;
	reconciledImportItemId: string | null;
	reconciledTransactionId: string | null;
	storeName: string | null;
	time: string | null;
	transferCounterpartExternalId: string | null;
	type: ImportItemType;
}

export interface ReconciledImportTarget {
	debtTarget: { transactionId: string } | { transactionImportItemId: string };
	entityId: string;
	entityType: typeof tagEntityType.transaction | typeof importItemTagEntityType;
}

export async function prepareImportItem(item: ImportItemToApprove, userId: string) {
	const [payment] = await queryRaw<{ required: boolean }>(
		`SELECT EXISTS(SELECT 1 FROM "OpenFinanceRecord" WHERE "userId"=$1 AND "reviewItemId"=$2 AND "state"='REVIEW' AND "snapshot"->>'operation'='PAYMENT') AS required`,
		[userId, item.id],
	);
	if (payment.required && (item.type !== "EXPENSE" || !item.paymentCreditCardId))
		throw new HttpException("Selecione o cartão deste pagamento de fatura antes de aprovar", 400);
	await validateItemAccounts(item, userId);
	if (item.storeName && item.type !== "EXPENSE")
		throw new HttpException("Loja só pode ser informada em saídas", 400);
	if (item.storeName) await resolveStore(userId, item.storeName);
	const tags = await getTagsByEntity(importItemTagEntityType, [item.id]);
	return assertTagOwnership(
		(tags.get(item.id) ?? []).map(tag => tag.id),
		userId,
	);
}

export async function persistImportItem(
	transaction: SqlExecutor,
	item: ImportItemToApprove,
	tagIds: string[],
	financialAccountId: string,
	userId: string,
) {
	await lockImportPayment(item);
	if (item.type === "YIELD") {
		const existingYield = await transaction.queryFirst(
			transaction.db.sql.public.FinancialAccountYield.select("id")
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.financialAccountId, item.destinationFinancialAccountId!),
						functions.eq(fields.date, item.date),
						functions.eq(fields.kind, "MANUAL"),
					),
				)
				.limit(1)
				.build(),
		);
		const yieldValues = {
			amount: String(item.amount),
			currency: await financialAccountCurrency(item.destinationFinancialAccountId),
			externalId: item.externalId,
			isExcluded: false,
			updatedAt: new Date(),
		};
		if (existingYield)
			await transaction.executeStatement(
				transaction.db.sql.public.FinancialAccountYield.update(yieldValues)
					.where((fields, functions) => functions.eq(fields.id, existingYield.id))
					.build(),
			);
		else
			await transaction.executeStatement(
				transaction.db.sql.public.FinancialAccountYield.insert([
					{
						...yieldValues,
						date: item.date,
						financialAccountId: item.destinationFinancialAccountId!,
						kind: "MANUAL",
					},
				]).build(),
			);
		return null;
	}

	const money = await importedMoney(item);
	const importedTransaction = await transaction.queryFirst(
		transaction.db.sql.public.Transaction.insert([
			{
				...money,
				amount: String(item.amount),
				date: item.date,
				description: item.description,
				destinationFinancialAccountId: item.destinationFinancialAccountId,
				isHidden: item.isHidden,
				originFinancialAccountId: item.originFinancialAccountId,
				paymentCreditCardId: item.paymentCreditCardId,
				storeName: item.storeName,
				time: item.time,
				type: item.type as TransactionType,
				userId,
			},
		])
			.returning("id")
			.build(),
	);
	if (!importedTransaction) throw new HttpException("Não foi possível salvar uma transação importada", 500);
	if (item.externalId)
		await transaction.executeStatement(
			transaction.db.sql.public.TransactionExternalReference.insert([
				{
					externalId: item.externalId,
					financialAccountId,
					transactionId: importedTransaction.id,
				},
			]).build(),
		);
	if (item.transferCounterpartExternalId)
		await transaction.executeStatement(
			transaction.db.sql.public.TransactionExternalReference.insert([
				{
					externalId: item.transferCounterpartExternalId,
					financialAccountId: item.destinationFinancialAccountId!,
					transactionId: importedTransaction.id,
				},
			]).build(),
		);
	if (tagIds.length) {
		await transaction.executeStatement(
			transaction.db.sql.public.TagAssignment.insert(
				tagIds.map(categoryId => ({
					categoryId,
					entityId: importedTransaction.id,
					entityType: "TRANSACTION",
				})),
			).build(),
		);
	}
	return importedTransaction.id;
}

export async function persistReconciledImportItem(
	transaction: SqlExecutor,
	item: ImportItemToApprove,
	tagIds: string[],
	financialAccountId: string,
): Promise<ReconciledImportTarget> {
	await lockImportPayment(item);
	const values = {
		amount: String(item.amount),
		date: item.date,
		description: item.description,
		destinationFinancialAccountId: item.destinationFinancialAccountId,
		isHidden: item.isHidden,
		originFinancialAccountId: item.originFinancialAccountId,
		paymentCreditCardId: item.paymentCreditCardId,
		storeName: item.storeName,
		time: item.time,
		type: item.type as TransactionType,
		updatedAt: new Date(),
	};
	if (item.reconciledTransactionId) {
		const previous = await transaction.queryFirst(
			transaction.db.sql.public.Transaction.select("paymentCreditCardId")
				.where((fields, functions) => functions.eq(fields.id, item.reconciledTransactionId!))
				.limit(1)
				.build(),
		);
		await transaction.executeStatement(
			transaction.db.sql.public.Transaction.update({ ...values, ...(await importedMoney(item)) })
				.where((fields, functions) => functions.eq(fields.id, item.reconciledTransactionId!))
				.build(),
		);
		if (previous?.paymentCreditCardId && previous.paymentCreditCardId !== item.paymentCreditCardId)
			await recalculateStatementPayments(transaction, [previous.paymentCreditCardId]);
		if (item.externalId) {
			const [reference] = await queryRaw<{ transactionId: string }>(
				`SELECT "transactionId" FROM "TransactionExternalReference" WHERE "financialAccountId"=$1 AND "externalId"=$2`,
				[financialAccountId, item.externalId],
			);
			if (reference && reference.transactionId !== item.reconciledTransactionId)
				throw new HttpException("Identidade externa já vinculada a outra transação", 409);
			if (!reference)
				await transaction.executeStatement(
					transaction.db.sql.public.TransactionExternalReference.insert([
						{ externalId: item.externalId, financialAccountId, transactionId: item.reconciledTransactionId },
					]).build(),
				);
		}
		return {
			debtTarget: { transactionId: item.reconciledTransactionId },
			entityId: item.reconciledTransactionId,
			entityType: tagEntityType.transaction,
		};
	}
	if (!item.reconciledImportItemId) throw new HttpException("Registro conciliado sem destino", 400);
	await transaction.executeStatement(
		transaction.db.sql.public.TransactionImportItem.update({
			...values,
			...(item.externalId && { externalId: item.externalId }),
		})
			.where((fields, functions) => functions.eq(fields.id, item.reconciledImportItemId!))
			.build(),
	);
	return {
		debtTarget: { transactionImportItemId: item.reconciledImportItemId },
		entityId: item.reconciledImportItemId,
		entityType: importItemTagEntityType,
	};
}

export async function assertImportItemIsNotReconciliationTarget(itemId: string) {
	if ((await getReconciliationTargetIds([itemId])).size)
		throw new HttpException("Aprove primeiro o item conciliado que atualiza esta transação", 400);
}

export async function getReconciliationTargetIds(itemIds: string[]) {
	if (!itemIds.length) return new Set<string>();
	const reconciliations = await queryRows(
		db.sql.public.TransactionImportItem.select("reconciledImportItemId")
			.where((fields, functions) => functions.in(fields.reconciledImportItemId, itemIds))
			.build(),
	);
	return new Set(
		reconciliations.flatMap(item => (item.reconciledImportItemId ? [item.reconciledImportItemId] : [])),
	);
}

export async function removeImportItem(transaction: SqlExecutor, itemId: string) {
	const [target] = await queryRaw<{ localId: string | null; reviewId: string | null }>(
		`SELECT COALESCE(i."reconciledTransactionId", r."transactionId") AS "localId", i."reconciledImportItemId" AS "reviewId" FROM "TransactionImportItem" i JOIN "TransactionImport" b ON b."id"=i."transactionImportId" LEFT JOIN "TransactionExternalReference" r ON r."financialAccountId"=b."financialAccountId" AND r."externalId"=i."externalId" WHERE i."id"=$1`,
		[itemId],
	);
	if (target?.reviewId)
		await queryRaw(
			`UPDATE "OpenFinanceRecord" r SET "reviewItemId"=$2, "importId"=i."transactionImportId" FROM "TransactionImportItem" i WHERE r."reviewItemId"=$1 AND i."id"=$2`,
			[itemId, target.reviewId],
		);
	else
		await settleExternalReview(
			itemId,
			target?.localId ? "TRANSACTION" : undefined,
			target?.localId ?? undefined,
		);

	await transaction.executeStatement(
		transaction.db.sql.public.TagAssignment.delete()
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.entityType, importItemTagEntityType),
					functions.eq(fields.entityId, itemId),
				),
			)
			.build(),
	);
	await transaction.executeStatement(
		transaction.db.sql.public.TransactionImportItem.delete()
			.where((fields, functions) => functions.eq(fields.id, itemId))
			.build(),
	);
}

export async function finalizeImportWhenEmpty(transaction: SqlExecutor, importId: string) {
	const remainingItem = await transaction.queryFirst(
		transaction.db.sql.public.TransactionImportItem.select("id")
			.where((fields, functions) => functions.eq(fields.transactionImportId, importId))
			.limit(1)
			.build(),
	);
	if (remainingItem) return false;
	await transaction.executeStatement(
		transaction.db.sql.public.TransactionImport.update({ status: "APPROVED", updatedAt: new Date() })
			.where((fields, functions) => functions.eq(fields.id, importId))
			.build(),
	);
	return true;
}

async function lockImportPayment(item: ImportItemToApprove) {
	if (item.paymentCreditCardId)
		await queryRaw(`SELECT "id" FROM "CreditCard" WHERE "id"=$1 FOR UPDATE`, [item.paymentCreditCardId]);
	if (item.originFinancialAccountId)
		await queryRaw(`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 FOR UPDATE`, [
			item.originFinancialAccountId,
		]);
}
