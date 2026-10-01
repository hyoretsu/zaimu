import Elysia, { t } from "elysia";
import { getFinancialAccountBalancesAtDates } from "~/modules/accounts/application/get-financial-account-balances";
import {
	assertBalanceAccountOwnership,
	assertCreditCardOwnership,
	assertDirectOwnership,
	assertTransactionOwnership,
	requireUserId,
} from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import type { CreditReadRow } from "~/modules/creditCards/application/credit-entry-reader";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import { getCreditPurchaseSyncStatus } from "~/modules/creditCards/domain/credit-purchase-sync-status";
import {
	deleteCreatorDebtEventForTransaction,
	getDebtSplitInput,
	getDebtSplitReturn,
	linkTransactionToDebt,
	syncTransactionDebtEvent,
} from "~/modules/debts/application";
import { DebtSplitInputDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";
import { materializeRecurrence } from "~/modules/recurring/application/recurrences";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { areTransferSuggestionTimesCompatible } from "~/modules/transaction-imports/domain/transfer-suggestions";
import { listTransactionsPage } from "~/modules/transactions/application/list-transactions-page";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { db, executeStatement, queryFirst, queryRaw, queryRows, withTransaction } from "~/shared/infra/sql";

const transactionColumns = [
	"id",
	"amount",
	"date",
	"time",
	"description",
	"storeName",
	"isHidden",
	"type",
	"categoryId",
	"paymentCreditCardId",
	"recurrenceId",
	"recurrenceOccurrenceDate",
	"salaryId",
	"salaryOccurrenceDate",
	"subscriptionId",
	"subscriptionOccurrenceDate",
	"originFinancialAccountId",
	"destinationFinancialAccountId",
	"createdAt",
	"updatedAt",
] as const;

const TransactionFilterType = t.Union([
	t.Literal("INCOME"),
	t.Literal("EXPENSE"),
	t.Literal("TRANSFER"),
	t.Literal("REFUND"),
]);
const TransactionType = t.Union([t.Literal("INCOME"), t.Literal("EXPENSE"), t.Literal("TRANSFER")]);
const TransactionSource = t.Union([t.Literal("CREDIT_CARD"), t.Literal("FINANCIAL_ACCOUNT")]);
const TransactionVisibility = t.Union([t.Literal("hidden"), t.Literal("visible")]);
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function normalizeSearch(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase("pt-BR")
		.replace(/\s+/gu, " ")
		.trim();
}

function getTransactionSearchText(transaction: {
	amount: number;
	categoryName?: string | null;
	date: Date;
	description?: string | null;
	destinationName?: string | null;
	originName?: string | null;
	storeName?: string | null;
	tags?: Array<{ name: string }>;
}) {
	const brazilianDate = transaction.date.toISOString().slice(0, 10).split("-").reverse().join("/");
	const amount = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(
		transaction.amount,
	);
	return [
		transaction.amount,
		amount,
		brazilianDate,
		transaction.categoryName,
		transaction.description,
		transaction.destinationName,
		transaction.originName,
		transaction.storeName,
		...(transaction.tags?.map(tag => tag.name) ?? []),
	].join(" ");
}

function resolveTransactionTime(value: string | null | undefined): string | null {
	if (value === null) return null;
	if (value !== undefined) {
		if (!timePattern.test(value)) throw new HttpException("Informe um horário válido", 400);
		return value;
	}
	return new Date().toTimeString().slice(0, 5);
}

async function refreshCardPayments(cardIds: string[]) {
	await withTransaction(transaction => recalculateStatementPayments(transaction, cardIds));
}

export const TransactionsController = new Elysia({ prefix: "/transactions" })
	.post(
		"/:id/transfer-suggestions/:counterpartId/accept",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await Promise.all([
				assertTransactionOwnership(params.id, userId),
				assertTransactionOwnership(params.counterpartId, userId),
			]);
			const transactions = await queryRows(
				db.sql.public.Transaction.select(...transactionColumns)
					.where((fields, functions) => functions.in(fields.id, [params.id, params.counterpartId]))
					.build(),
			);
			if (transactions.length !== 2) throw new HttpException("Sugestão de transferência não encontrada", 404);
			const [left, right] = transactions;
			if (
				!areTransferSuggestionTimesCompatible(left, right) ||
				Number(left.amount) !== Number(right.amount) ||
				!(
					(left.type === "EXPENSE" && right.type === "INCOME") ||
					(left.type === "INCOME" && right.type === "EXPENSE")
				)
			)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
			const outgoing = left.type === "EXPENSE" ? left : right;
			const incoming = left.type === "INCOME" ? left : right;
			const outgoingAccountId = outgoing.originFinancialAccountId;
			const incomingAccountId = incoming.destinationFinancialAccountId;
			if (!outgoingAccountId || !incomingAccountId || outgoingAccountId === incomingAccountId)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
			const references = await queryRows(
				db.sql.public.TransactionExternalReference.select("externalId", "financialAccountId", "transactionId")
					.where((fields, functions) => functions.in(fields.transactionId, [left.id, right.id]))
					.build(),
			);
			const retained = left.createdAt <= right.createdAt ? left : right;
			const removed = retained.id === left.id ? right : left;
			await withTransaction(async transaction => {
				await transaction.executeStatement(
					transaction.db.sql.public.TagAssignment.delete()
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.entityType, tagEntityType.transaction),
								functions.eq(fields.entityId, retained.id),
							),
						)
						.build(),
				);
				await transaction.executeStatement(
					transaction.db.sql.public.Transaction.delete()
						.where((fields, functions) => functions.eq(fields.id, removed.id))
						.build(),
				);
				await transaction.executeStatement(
					transaction.db.sql.public.Transaction.update({
						categoryId: null,
						destinationFinancialAccountId: incomingAccountId,
						originFinancialAccountId: outgoingAccountId,
						paymentCreditCardId: null,
						storeName: null,
						type: "TRANSFER",
						updatedAt: new Date(),
					})
						.where((fields, functions) => functions.eq(fields.id, retained.id))
						.build(),
				);
				const removedReferences = references.filter(reference => reference.transactionId === removed.id);
				if (removedReferences.length)
					await transaction.executeStatement(
						transaction.db.sql.public.TransactionExternalReference.insert(
							removedReferences.map(reference => ({
								externalId: reference.externalId,
								financialAccountId: reference.financialAccountId,
								transactionId: retained.id,
							})),
						).build(),
					);
			});
			return { success: true };
		},
		{
			params: t.Object({
				counterpartId: t.String({ maxLength: 36, minLength: 1 }),
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get("/transfer-suggestions", async ({ request }) => {
		const userId = await requireUserId(request);
		const [transactions, rejections] = await Promise.all([
			queryRows(
				db.sql.public.Transaction.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
					functions.or(
						functions.and(
							functions.eq(fields.Transaction.type, "EXPENSE"),
							functions.eq(fields.Transaction.originFinancialAccountId, fields.FinancialAccount.id),
						),
						functions.and(
							functions.eq(fields.Transaction.type, "INCOME"),
							functions.eq(fields.Transaction.destinationFinancialAccountId, fields.FinancialAccount.id),
						),
					),
				)
					.outerLeftJoin(db.sql.public.FinancialInstitution, (fields, functions) =>
						functions.eq(fields.FinancialAccount.institutionId, fields.FinancialInstitution.id),
					)
					.select((fields, functions) => ({
						accountName:
							functions.raw`COALESCE(${fields.FinancialAccount.name}, ${fields.FinancialInstitution.name})`.returns(
								"sql/varchar@1",
							),
						accountType: fields.FinancialAccount.type,
						amount: fields.Transaction.amount,
						createdAt: fields.Transaction.createdAt,
						date: fields.Transaction.date,
						description: fields.Transaction.description,
						destinationFinancialAccountId: fields.Transaction.destinationFinancialAccountId,
						id: fields.Transaction.id,
						isHidden: fields.Transaction.isHidden,
						originFinancialAccountId: fields.Transaction.originFinancialAccountId,
						storeName: fields.Transaction.storeName,
						time: fields.Transaction.time,
						type: fields.Transaction.type,
					}))
					.where((fields, functions) => functions.eq(fields.FinancialAccount.userId, userId))
					.build(),
			),
			queryRows(
				db.sql.public.TransactionTransferSuggestionRejection.select(
					"firstTransactionId",
					"secondTransactionId",
				)
					.where((fields, functions) => functions.eq(fields.userId, userId))
					.build(),
			),
		]);
		const rejectedPairs = new Set(
			rejections.map(rejection => `${rejection.firstTransactionId}:${rejection.secondTransactionId}`),
		);
		const candidates = transactions.map(transaction => ({
			...transaction,
			amount: Number(transaction.amount),
			destinationAccountType: transaction.type === "INCOME" ? transaction.accountType : null,
			destinationName: transaction.type === "INCOME" ? transaction.accountName : null,
			originAccountType: transaction.type === "EXPENSE" ? transaction.accountType : null,
			originName: transaction.type === "EXPENSE" ? transaction.accountName : null,
			source: "FINANCIAL_ACCOUNT" as const,
		}));
		return candidates.flatMap((transaction, index) =>
			candidates.slice(index + 1).flatMap(counterpart => {
				const transactionAccountId =
					transaction.type === "INCOME"
						? transaction.destinationFinancialAccountId
						: transaction.originFinancialAccountId;
				const counterpartAccountId =
					counterpart.type === "INCOME"
						? counterpart.destinationFinancialAccountId
						: counterpart.originFinancialAccountId;
				const key = [transaction.id, counterpart.id].sort().join(":");
				return areTransferSuggestionTimesCompatible(transaction, counterpart) &&
					transaction.amount === counterpart.amount &&
					transactionAccountId !== counterpartAccountId &&
					((transaction.type === "EXPENSE" && counterpart.type === "INCOME") ||
						(transaction.type === "INCOME" && counterpart.type === "EXPENSE")) &&
					!rejectedPairs.has(key)
					? [{ counterpart, transaction }]
					: [];
			}),
		);
	})
	.post(
		"/:id/transfer-suggestions/:counterpartId/reject",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await Promise.all([
				assertTransactionOwnership(params.id, userId),
				assertTransactionOwnership(params.counterpartId, userId),
			]);
			const transactions = await queryRows(
				db.sql.public.Transaction.select(...transactionColumns)
					.where((fields, functions) => functions.in(fields.id, [params.id, params.counterpartId]))
					.build(),
			);
			if (transactions.length !== 2) throw new HttpException("Sugestão de transferência não encontrada", 404);
			const [left, right] = transactions;
			if (
				!areTransferSuggestionTimesCompatible(left, right) ||
				Number(left.amount) !== Number(right.amount) ||
				!(
					(left.type === "EXPENSE" && right.type === "INCOME") ||
					(left.type === "INCOME" && right.type === "EXPENSE")
				)
			)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
			const [firstTransactionId, secondTransactionId] = [left.id, right.id].sort();
			const existing = await queryFirst(
				db.sql.public.TransactionTransferSuggestionRejection.select("id")
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.userId, userId),
							functions.eq(fields.firstTransactionId, firstTransactionId),
							functions.eq(fields.secondTransactionId, secondTransactionId),
						),
					)
					.limit(1)
					.build(),
			);
			if (!existing)
				await executeStatement(
					db.sql.public.TransactionTransferSuggestionRejection.insert([
						{ firstTransactionId, secondTransactionId, userId },
					]).build(),
				);
			return { success: true };
		},
		{
			params: t.Object({
				counterpartId: t.String({ maxLength: 36, minLength: 1 }),
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get(
		"/",
		async ({ query, request, set }) => {
			const userId = await requireUserId(request);
			if (query.financialAccountId) {
				await assertDirectOwnership("FinancialAccount", query.financialAccountId, userId);
			}
			if (query.categoryId) await assertDirectOwnership("Category", query.categoryId, userId);
			if (query.view === "daily") {
				const cached = await distributedCache.remember(userId, "transactions:list", query, () =>
					listTransactionsPage(userId, query),
				);
				set.headers.etag = cached.etag;
				set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
				if (request.headers.get("if-none-match") === cached.etag) {
					set.status = 304;
					return null;
				}
				return cached.value;
			}
			const origin = db.sql.public.FinancialAccount.select(
				"id",
				"institutionId",
				"userId",
				"name",
				"type",
			).as("origin");
			const originInstitution = db.sql.public.FinancialInstitution.select("id", "name").as(
				"originInstitution",
			);
			const destination = db.sql.public.FinancialAccount.select(
				"id",
				"institutionId",
				"userId",
				"name",
				"type",
			).as("destination");
			const destinationInstitution = db.sql.public.FinancialInstitution.select("id", "name").as(
				"destinationInstitution",
			);
			const originRewards = db.sql.public.RewardsAccount.select("financialAccountId", "kind").as(
				"originRewards",
			);
			const destinationRewards = db.sql.public.RewardsAccount.select("financialAccountId", "kind").as(
				"destinationRewards",
			);

			const paymentCard = db.sql.public.CreditCard.select("id", "financialAccountId").as("paymentCard");
			const paymentCardAccount = db.sql.public.FinancialAccount.select("id", "institutionId", "name").as(
				"paymentCardAccount",
			);
			const paymentCardInstitution = db.sql.public.FinancialInstitution.select("id", "name").as(
				"paymentCardInstitution",
			);
			const taggedTransactionIds = query.categoryId
				? (
						await queryRows(
							db.sql.public.TagAssignment.select("entityId")
								.where((fields, functions) =>
									functions.and(
										functions.eq(fields.categoryId, query.categoryId!),
										functions.eq(fields.entityType, tagEntityType.transaction),
									),
								)
								.build(),
						)
					).map(assignment => assignment.entityId)
				: undefined;
			let queryBuilder = db.sql.public.Transaction.outerLeftJoin(db.sql.public.Category, (f, fn) =>
				fn.eq(f.Transaction.categoryId, f.Category.id),
			)
				.outerLeftJoin(origin, (f, fn) => fn.eq(f.Transaction.originFinancialAccountId, f.origin.id))
				.outerLeftJoin(originInstitution, (f, fn) => fn.eq(f.origin.institutionId, f.originInstitution.id))
				.outerLeftJoin(originRewards, (f, fn) => fn.eq(f.origin.id, f.originRewards.financialAccountId))
				.outerLeftJoin(destination, (f, fn) =>
					fn.eq(f.Transaction.destinationFinancialAccountId, f.destination.id),
				)
				.outerLeftJoin(destinationInstitution, (f, fn) =>
					fn.eq(f.destination.institutionId, f.destinationInstitution.id),
				)
				.outerLeftJoin(destinationRewards, (f, fn) =>
					fn.eq(f.destination.id, f.destinationRewards.financialAccountId),
				)
				.outerLeftJoin(paymentCard, (f, fn) => fn.eq(f.Transaction.paymentCreditCardId, f.paymentCard.id))
				.outerLeftJoin(paymentCardAccount, (f, fn) =>
					fn.eq(f.paymentCard.financialAccountId, f.paymentCardAccount.id),
				)
				.outerLeftJoin(paymentCardInstitution, (f, fn) =>
					fn.eq(f.paymentCardAccount.institutionId, f.paymentCardInstitution.id),
				)
				.outerLeftJoin(db.sql.public.Recurrence, (f, fn) =>
					fn.eq(f.Transaction.recurrenceId, f.Recurrence.id),
				)
				.outerLeftJoin(db.sql.public.Salary, (f, fn) => fn.eq(f.Transaction.salaryId, f.Salary.id))
				.outerLeftJoin(db.sql.public.Subscription, (f, fn) =>
					fn.eq(f.Transaction.subscriptionId, f.Subscription.id),
				)
				.select((f, fn) => ({
					amount: f.Transaction.amount,
					categoryColor: f.Category.color,
					categoryName: f.Category.name,
					createdAt: f.Transaction.createdAt,
					creditCardName:
						fn.raw`COALESCE(${f.paymentCardAccount.name}, ${f.paymentCardInstitution.name})`.returns(
							"sql/varchar@1",
						),
					creditCardStatementDate: fn.raw`NULL::date`.returns("pg/date@1"),
					date: f.Transaction.date,
					description: f.Transaction.description,
					destinationAccountRewardsKind: f.destinationRewards.kind,
					destinationAccountType: f.destination.type,
					destinationFinancialAccountId: f.Transaction.destinationFinancialAccountId,
					destinationName: fn.raw`COALESCE(${f.destination.name}, ${f.destinationInstitution.name})`.returns(
						"sql/varchar@1",
					),
					id: f.Transaction.id,
					isHidden: f.Transaction.isHidden,
					originAccountRewardsKind: f.originRewards.kind,
					originAccountType: f.origin.type,
					originFinancialAccountId: f.Transaction.originFinancialAccountId,
					originName: fn.raw`COALESCE(${f.origin.name}, ${f.originInstitution.name})`.returns(
						"sql/varchar@1",
					),
					paymentCreditCardId: f.Transaction.paymentCreditCardId,
					recurrenceId: f.Transaction.recurrenceId,
					recurrenceOccurrenceDate: f.Transaction.recurrenceOccurrenceDate,
					salaryId: f.Transaction.salaryId,
					salaryOccurrenceDate: f.Transaction.salaryOccurrenceDate,
					storeName: f.Transaction.storeName,
					subscriptionId: f.Transaction.subscriptionId,
					subscriptionOccurrenceDate: f.Transaction.subscriptionOccurrenceDate,
					time: f.Transaction.time,
					type: f.Transaction.type,
				}))
				.where((f, fn) =>
					fn.or(
						fn.eq(f.origin.userId, userId),
						fn.eq(f.destination.userId, userId),
						fn.eq(f.Recurrence.userId, userId),
						fn.eq(f.Salary.userId, userId),
						fn.eq(f.Subscription.userId, userId),
					),
				);

			if (query.startDate) {
				queryBuilder = queryBuilder.where((f, fn) => fn.gte(f.Transaction.date, new Date(query.startDate!)));
			}
			if (query.endDate) {
				queryBuilder = queryBuilder.where((f, fn) =>
					fn.lte(f.Transaction.date, new Date(`${query.endDate!}T23:59:59.999`)),
				);
			}
			if (query.type) {
				queryBuilder = queryBuilder.where((f, fn) =>
					fn.eq(f.Transaction.type, (query.type === "REFUND" ? "INCOME" : query.type)!),
				);
			}
			if (query.categoryId) {
				queryBuilder = queryBuilder.where((f, fn) =>
					taggedTransactionIds?.length
						? fn.or(
								fn.in(f.Transaction.id, taggedTransactionIds),
								fn.eq(f.Transaction.categoryId, query.categoryId!),
							)
						: fn.eq(f.Transaction.categoryId, query.categoryId!),
				);
			}
			if (query.financialAccountId) {
				queryBuilder = queryBuilder.where((f, fn) =>
					fn.or(
						fn.eq(f.Transaction.originFinancialAccountId, query.financialAccountId!),
						fn.eq(f.Transaction.destinationFinancialAccountId, query.financialAccountId!),
					),
				);
			}
			if (query.visibility === "hidden") {
				queryBuilder = queryBuilder.where((f, fn) => fn.eq(f.Transaction.isHidden, true));
			}
			if (query.visibility === "visible") {
				queryBuilder = queryBuilder.where((f, fn) => fn.eq(f.Transaction.isHidden, false));
			}

			const transactions = await queryRows(queryBuilder.build());
			const [tagsByTransaction, externalReferences] = await Promise.all([
				getTagsByEntity(
					tagEntityType.transaction,
					transactions.map(transaction => transaction.id),
				),
				queryRows(
					db.sql.public.TransactionExternalReference.select("transactionId", "externalId")
						.where((fields, functions) =>
							functions.in(
								fields.transactionId,
								transactions.map(transaction => transaction.id),
							),
						)
						.build(),
				),
			]);
			const externalIdsByTransaction = new Map<string, string[]>();
			for (const reference of externalReferences) {
				const externalIds = externalIdsByTransaction.get(reference.transactionId) ?? [];
				externalIds.push(reference.externalId);
				externalIdsByTransaction.set(reference.transactionId, externalIds);
			}
			const normalizedTransactions = await Promise.all(
				transactions.map(async transaction => {
					const tags = tagsByTransaction.get(transaction.id) ?? [];
					const paymentAccountType =
						transaction.type === "INCOME"
							? transaction.destinationAccountType
							: transaction.originAccountType;
					return {
						...transaction,
						debtSplit: await getDebtSplitReturn(
							{ transactionId: transaction.id },
							Number(transaction.amount),
						),
						externalIds: externalIdsByTransaction.get(transaction.id) ?? [],
						isSynced: (externalIdsByTransaction.get(transaction.id)?.length ?? 0) > 0,
						source:
							transaction.type !== "TRANSFER" &&
							paymentAccountType === "CREDIT_CARD" &&
							!transaction.recurrenceId &&
							!transaction.salaryId &&
							!transaction.subscriptionId
								? ("CREDIT_CARD" as const)
								: ("FINANCIAL_ACCOUNT" as const),
						sourceName: transaction.type === "INCOME" ? transaction.destinationName : transaction.originName,
						tagIds: tags.map(tag => tag.id),
						tags,
					};
				}),
			);

			let purchases: Array<{
				amount: unknown;
				categoryId: string | null;
				categoryColor: string | null;
				categoryName: string | null;
				creditCardId: string;
				createdAt: Date;
				currentInstallment: number;
				date: Date;
				description: string;
				feeAmount: number | null;
				feeDescription: string | null;
				id: string;
				installmentAmount: unknown;
				installments: number;
				isRefund: boolean;
				originFinancialAccountId: string;
				refundOfPurchaseId: string | null;
				statementId: string;
				storeName: string | null;
				subscriptionId: string | null;
				time: string | null;
				sourceName: string;
			}> = [];
			if (
				query.source !== "FINANCIAL_ACCOUNT" &&
				query.visibility !== "hidden" &&
				query.type !== "TRANSFER"
			) {
				purchases = await queryRaw<(typeof purchases)[number] & Record<string, unknown>>(
					`SELECT p.*,p."totalAmount" AS "amount",p."purchaseDate" AS "date",a."id" AS "originFinancialAccountId",COALESCE(a."name",i."name",'Cartão de crédito') AS "sourceName",cat."name" AS "categoryName",cat."color" AS "categoryColor" FROM "CreditConsumption" p JOIN "CreditCard" c ON c."id"=p."creditCardId" JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" LEFT JOIN "FinancialInstitution" i ON i."id"=a."institutionId" LEFT JOIN "Category" cat ON cat."id"=p."categoryId" WHERE p."userId"=$1 AND ($2::date IS NULL OR p."purchaseDate">=$2) AND ($3::date IS NULL OR p."purchaseDate"<=$3) AND ($4::text IS NULL OR a."id"=$4) AND ($5::text IS NULL OR ($5='EXPENSE' AND NOT p."isRefund") OR ($5='REFUND' AND p."isRefund"))`,
					[
						userId,
						query.startDate ?? null,
						query.endDate ?? null,
						query.financialAccountId ?? null,
						query.type ?? null,
					],
				);
			}
			const purchaseSyncStatus = getCreditPurchaseSyncStatus(
				await queryRaw<CreditReadRow & { statementDate: Date }>(
					`SELECT p.*,s."statementDate" FROM "CreditEntry" p JOIN "CreditCardStatement" s ON s."id"=p."statementId" WHERE p."userId"=$1`,
					[userId],
				),
			);
			const purchaseTags = await getTagsByEntity(
				tagEntityType.creditPurchase,
				purchases.map(purchase => purchase.id),
			);
			const purchaseIds = purchases.filter(purchase => !purchase.isRefund).map(purchase => purchase.id);
			const refundedPurchases = await queryRaw<CreditReadRow>(
				`SELECT * FROM "CreditEntry" WHERE "refundOfPurchaseId"=ANY($1)`,
				[purchaseIds],
			);
			const refundsByPurchaseId = new Map(
				refundedPurchases.flatMap(purchase =>
					purchase.refundOfPurchaseId ? [[purchase.refundOfPurchaseId, purchase] as const] : [],
				),
			);
			const normalizedPurchases = (
				await Promise.all(
					purchases.map(async purchase => {
						const tags = purchaseTags.get(purchase.id) ?? [];
						return {
							...purchase,
							...purchaseSyncStatus.get(purchase.id),
							amount: purchase.isRefund ? Math.abs(Number(purchase.amount)) : Number(purchase.amount),
							debtSplit: await getDebtSplitReturn(
								{ creditPurchaseId: purchase.id },
								Math.abs(Number(purchase.amount)),
							),
							destinationFinancialAccountId: null,
							destinationName: null,
							hasRefund: !purchase.isRefund && refundsByPurchaseId.has(purchase.id),
							originName: purchase.sourceName,
							paymentCreditCardId: null,
							refund: (() => {
								const refund = refundsByPurchaseId.get(purchase.id);
								return refund
									? {
											amount: Math.abs(Number(refund.totalAmount)),
											date: refund.purchaseDate.toISOString(),
											id: refund.id,
										}
									: undefined;
							})(),
							source: "CREDIT_CARD" as const,
							statementId: purchase.statementId,
							tagIds: tags.map(tag => tag.id),
							tags,
							type: purchase.isRefund ? ("REFUND" as const) : ("EXPENSE" as const),
						};
					}),
				)
			).filter(
				purchase =>
					!query.categoryId ||
					purchase.tagIds.includes(query.categoryId) ||
					purchase.categoryId === query.categoryId,
			);

			const search = query.search ? normalizeSearch(query.search) : undefined;
			const sortedTransactions = [...normalizedTransactions, ...normalizedPurchases]
				.filter(
					transaction =>
						(!query.source || transaction.source === query.source) &&
						(!search || normalizeSearch(getTransactionSearchText(transaction)).includes(search)),
				)
				.sort(
					(left, right) =>
						new Date(right.date).getTime() - new Date(left.date).getTime() ||
						new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
				);
			if (query.view === "daily") {
				const page =
					query.limit === undefined && query.offset === undefined
						? sortedTransactions
						: sortedTransactions.slice(
								query.offset ?? 0,
								(query.offset ?? 0) + (query.limit ?? sortedTransactions.length),
							);
				const transactionDateKey = (transaction: (typeof page)[number]) =>
					new Date(transaction.date).toISOString().slice(0, 10);
				const dates = [...new Set(page.map(transactionDateKey))];
				const accounts = await queryRows(
					db.sql.public.FinancialAccount.select("id", "type")
						.where((fields, functions) => functions.eq(fields.userId, userId))
						.build(),
				);
				const monetaryAccountIds = new Set(
					accounts
						.filter(account => !["CREDIT_CARD", "INVESTMENT", "REWARDS", "SAVINGS"].includes(account.type))
						.map(account => account.id),
				);
				const balances = await getFinancialAccountBalancesAtDates(
					accounts.map(account => account.id),
					dates.map(date => new Date(`${date}T12:00:00`)),
				);
				const endingBalanceByDate = new Map(
					balances.map(({ balances: accountBalances, date }) => [
						date.toISOString().slice(0, 10),
						[...accountBalances].reduce(
							(total, [accountId, balance]) => total + (monetaryAccountIds.has(accountId) ? balance : 0),
							0,
						),
					]),
				);
				return {
					days: dates.map(date => ({
						date,
						endingBalance: endingBalanceByDate.get(date) ?? 0,
						transactions: page.filter(transaction => transactionDateKey(transaction) === date),
					})),
					hasMore: page.length > 0,
					resultCount: page.length,
				};
			}

			if (query.limit === undefined && query.offset === undefined) return sortedTransactions;

			return sortedTransactions.slice(
				query.offset ?? 0,
				(query.offset ?? 0) + (query.limit ?? sortedTransactions.length),
			);
		},
		{
			detail: { tags: ["Transactions"] },
			query: t.Object({
				categoryId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				cursor: t.Optional(t.String({ maxLength: 2048, minLength: 1 })),
				endDate: t.Optional(t.String()),
				financialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				limit: t.Optional(t.Number({ maximum: 500, minimum: 1 })),
				offset: t.Optional(t.Number({ minimum: 0 })),
				search: t.Optional(t.String({ maxLength: 200 })),
				source: t.Optional(TransactionSource),
				startDate: t.Optional(t.String()),
				type: t.Optional(TransactionFilterType),
				view: t.Optional(t.Literal("daily")),
				visibility: t.Optional(TransactionVisibility),
			}),
		},
	)
	.get(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertTransactionOwnership(params.id, userId);
			const transaction = await queryFirst(
				db.sql.public.Transaction.select(...transactionColumns)
					.where((f, fn) => fn.eq(f.id, params.id))
					.limit(1)
					.build(),
			);

			if (!transaction) {
				throw new HttpException("Transaction not found", 404);
			}

			const tagsByTransaction = await getTagsByEntity(tagEntityType.transaction, [transaction.id]);
			const tags = tagsByTransaction.get(transaction.id) ?? [];
			return { ...transaction, tagIds: tags.map(tag => tag.id), tags };
		},
		{
			detail: { tags: ["Transactions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get(
		"/:id/history",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertTransactionOwnership(params.id, userId);
			const history = await queryRows(
				db.sql.public.TransactionHistory.select(
					"id",
					"transactionId",
					"field",
					"oldValue",
					"newValue",
					"changedAt",
				)
					.where((f, fn) => fn.eq(f.transactionId, params.id))
					.orderBy("changedAt", { direction: "desc" })
					.build(),
			);

			return history;
		},
		{
			detail: { tags: ["Transactions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			if (body.paymentCreditCardId) {
				if ((body.type ?? "EXPENSE") !== "EXPENSE")
					throw new HttpException("Apenas saídas podem pagar um cartão", 400);
				await assertCreditCardOwnership(body.paymentCreditCardId, userId);
			}
			if (body.recurrenceId) await assertDirectOwnership("Recurrence", body.recurrenceId, userId);
			if (body.salaryId) await assertDirectOwnership("Salary", body.salaryId, userId);
			if (body.subscriptionId) await assertDirectOwnership("Subscription", body.subscriptionId, userId);
			let originFinancialAccountId = body.originFinancialAccountId;
			let inheritedPaymentAccount = false;
			let inheritedStoreName: string | null | undefined;
			if (body.recurrenceId) {
				const recurringPayment = await queryFirst(
					db.sql.public.Recurrence.select("originFinancialAccountId", "storeName")
						.where((fields, functions) => functions.eq(fields.id, body.recurrenceId!))
						.limit(1)
						.build(),
				);
				inheritedStoreName = recurringPayment?.storeName;
				if (!originFinancialAccountId && !body.destinationFinancialAccountId) {
					originFinancialAccountId = recurringPayment?.originFinancialAccountId ?? undefined;
					inheritedPaymentAccount = Boolean(originFinancialAccountId);
				}
			}
			if (body.subscriptionId) {
				const subscription = await queryFirst(
					db.sql.public.Subscription.select("financialAccountId", "storeName")
						.where((fields, functions) => functions.eq(fields.id, body.subscriptionId!))
						.limit(1)
						.build(),
				);
				inheritedStoreName = subscription?.storeName;
				if (!originFinancialAccountId && !body.destinationFinancialAccountId) {
					originFinancialAccountId = subscription?.financialAccountId ?? undefined;
					inheritedPaymentAccount = Boolean(originFinancialAccountId);
				}
			}
			if (originFinancialAccountId) {
				if (inheritedPaymentAccount)
					await assertDirectOwnership("FinancialAccount", originFinancialAccountId, userId);
				else
					await assertBalanceAccountOwnership(originFinancialAccountId, userId, {
						allowCashback: (body.type ?? "EXPENSE") === "EXPENSE" || body.type === "TRANSFER",
					});
			}
			if (body.destinationFinancialAccountId) {
				await assertBalanceAccountOwnership(body.destinationFinancialAccountId, userId, {
					allowCashback: (body.type ?? "EXPENSE") === "INCOME",
					allowPoints: (body.type ?? "EXPENSE") === "INCOME",
				});
			}
			const hasExplicitTags = body.tagIds !== undefined || body.categoryId !== undefined;
			const linkedTagSource = body.recurrenceId
				? { entityId: body.recurrenceId, entityType: "RECURRENCE" }
				: body.salaryId
					? { entityId: body.salaryId, entityType: tagEntityType.salary }
					: body.subscriptionId
						? { entityId: body.subscriptionId, entityType: tagEntityType.subscription }
						: undefined;
			const tagIds = hasExplicitTags
				? await assertTagOwnership(body.tagIds ?? (body.categoryId ? [body.categoryId] : []), userId)
				: linkedTagSource
					? ((await getTagsByEntity(linkedTagSource.entityType, [linkedTagSource.entityId]))
							.get(linkedTagSource.entityId)
							?.map(tag => tag.id) ?? [])
					: [];
			if (
				!originFinancialAccountId &&
				!body.destinationFinancialAccountId &&
				!body.recurrenceId &&
				!body.salaryId &&
				!body.subscriptionId
			) {
				throw new HttpException("Informe uma conta financeira ou recorrência", 400);
			}
			const storeName = body.storeName ?? inheritedStoreName;
			if (storeName && (body.type ?? "EXPENSE") !== "EXPENSE") {
				throw new HttpException("Loja só pode ser informada em transações de saída", 400);
			}
			if (storeName) await resolveStore(userId, storeName);
			const salaryOccurrenceDate = body.salaryId
				? new Date(body.salaryOccurrenceDate ?? body.date)
				: undefined;
			const recurrenceOccurrenceDate = body.recurrenceId
				? new Date(body.recurrenceOccurrenceDate ?? body.date)
				: undefined;
			const subscriptionOccurrenceDate = body.subscriptionId
				? new Date(body.subscriptionOccurrenceDate ?? body.date)
				: undefined;
			const findExistingOccurrence = () => {
				if (body.recurrenceId && recurrenceOccurrenceDate) {
					return queryFirst(
						db.sql.public.Transaction.select(...transactionColumns)
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.recurrenceId, body.recurrenceId!),
									functions.eq(fields.recurrenceOccurrenceDate, recurrenceOccurrenceDate),
								),
							)
							.limit(1)
							.build(),
					);
				}
				if (body.salaryId && salaryOccurrenceDate) {
					return queryFirst(
						db.sql.public.Transaction.select(...transactionColumns)
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.salaryId, body.salaryId!),
									functions.eq(fields.salaryOccurrenceDate, salaryOccurrenceDate),
								),
							)
							.limit(1)
							.build(),
					);
				}
				if (body.subscriptionId && subscriptionOccurrenceDate) {
					return queryFirst(
						db.sql.public.Transaction.select(...transactionColumns)
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.subscriptionId, body.subscriptionId!),
									functions.eq(fields.subscriptionOccurrenceDate, subscriptionOccurrenceDate),
								),
							)
							.limit(1)
							.build(),
					);
				}
				return Promise.resolve(undefined);
			};
			if (body.recurrenceId && recurrenceOccurrenceDate) {
				const scheduledDate = recurrenceOccurrenceDate.toISOString().slice(0, 10);
				await materializeRecurrence(userId, body.recurrenceId, scheduledDate, {
					from: scheduledDate,
					through: scheduledDate,
				});
				const concrete = await findExistingOccurrence();
				if (!concrete)
					throw new HttpException("Ocorrência indisponível, excluída ou pertencente ao cartão", 409);
			}
			let transaction = await findExistingOccurrence();
			let wasCreated = false;
			if (!transaction) {
				try {
					transaction = await queryFirst(
						db.sql.public.Transaction.insert([
							{
								amount: String(body.amount),
								categoryId: tagIds[0],
								date: new Date(body.date),
								description: body.description,
								destinationFinancialAccountId: body.destinationFinancialAccountId,
								isHidden: body.isHidden ?? false,
								originFinancialAccountId,
								paymentCreditCardId: body.paymentCreditCardId,
								recurrenceId: body.recurrenceId,
								recurrenceOccurrenceDate,
								salaryId: body.salaryId,
								salaryOccurrenceDate,
								storeName,
								subscriptionId: body.subscriptionId,
								subscriptionOccurrenceDate,
								time:
									body.recurrenceId || body.salaryId || body.subscriptionId
										? null
										: resolveTransactionTime(body.time),
								type: body.type ?? "EXPENSE",
								userId,
							},
						])
							.returning(...transactionColumns)
							.build(),
					);
					wasCreated = Boolean(transaction);
				} catch (error) {
					transaction = await findExistingOccurrence();
					if (!transaction) throw error;
				}
			}
			if (!transaction) throw new HttpException("Transaction not created", 500);
			if (wasCreated) {
				if (body.paymentCreditCardId) await refreshCardPayments([body.paymentCreditCardId]);
				await replaceEntityTags({
					entityIds: [transaction.id],
					entityType: tagEntityType.transaction,
					tagIds,
				});
				const inheritedDebtSplit = body.recurrenceId
					? await getDebtSplitInput({ recurringPaymentId: body.recurrenceId })
					: body.subscriptionId
						? await getDebtSplitInput({ subscriptionId: body.subscriptionId })
						: undefined;
				await linkTransactionToDebt({
					amount: body.amount,
					date: body.date,
					debtSplit: inheritedDebtSplit ?? body.debtSplit,
					description: body.description,
					matchEventId: body.matchDebtEventId,
					transactionId: transaction.id,
					type: body.type ?? "EXPENSE",
					userId,
				});
			}

			const tagsByTransaction = await getTagsByEntity(tagEntityType.transaction, [transaction.id]);
			if (wasCreated)
				for (const accountId of [
					transaction.originFinancialAccountId,
					transaction.destinationFinancialAccountId,
				])
					if (accountId)
						await enqueueAccountYieldRecalculation(
							accountId,
							transaction.date,
							`transaction:${transaction.id}`,
						);
			const tags = tagsByTransaction.get(transaction.id) ?? [];
			return {
				...transaction,
				debtSplit: await getDebtSplitReturn({ transactionId: transaction.id }, Number(transaction.amount)),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Number(),
				categoryId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				date: t.String(),
				debtSplit: t.Optional(DebtSplitInputDTO),
				description: t.Optional(t.String({ maxLength: 1000 })),
				destinationFinancialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				isHidden: t.Optional(t.Boolean()),
				matchDebtEventId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				originFinancialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				paymentCreditCardId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				recurrenceId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				recurrenceOccurrenceDate: t.Optional(t.String()),
				salaryId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				salaryOccurrenceDate: t.Optional(t.String()),
				storeName: t.Optional(t.String({ maxLength: 200 })),
				subscriptionId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				subscriptionOccurrenceDate: t.Optional(t.String()),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
				time: t.Optional(t.Nullable(t.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$" }))),
				type: t.Optional(TransactionType),
			}),
			detail: { tags: ["Transactions"] },
		},
	)
	.patch(
		"/:id",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			await assertTransactionOwnership(params.id, userId);
			const tagIds =
				body.tagIds !== undefined || body.categoryId !== undefined
					? await assertTagOwnership(body.tagIds ?? (body.categoryId ? [body.categoryId] : []), userId)
					: undefined;
			const existing = await queryFirst(
				db.sql.public.Transaction.select(...transactionColumns)
					.where((f, fn) => fn.eq(f.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Transaction not found", 404);
			}
			const transactionType = body.type ?? existing.type;
			const originFinancialAccountId = body.originFinancialAccountId ?? existing.originFinancialAccountId;
			const destinationFinancialAccountId =
				body.destinationFinancialAccountId ?? existing.destinationFinancialAccountId;
			if (originFinancialAccountId)
				await assertBalanceAccountOwnership(originFinancialAccountId, userId, {
					allowCashback: transactionType === "EXPENSE" || transactionType === "TRANSFER",
				});
			if (destinationFinancialAccountId)
				await assertBalanceAccountOwnership(destinationFinancialAccountId, userId, {
					allowCashback: transactionType === "INCOME",
					allowPoints: transactionType === "INCOME",
				});
			if (
				(existing.paymentCreditCardId || body.paymentCreditCardId) &&
				(body.type ?? existing.type) !== "EXPENSE"
			) {
				throw new HttpException("A transação vinculada à fatura deve ser uma saída", 400);
			}
			if (body.paymentCreditCardId) await assertCreditCardOwnership(body.paymentCreditCardId, userId);
			if (body.amount !== undefined && body.amount <= 0) {
				throw new HttpException("Informe um valor maior que zero", 400);
			}
			if (body.storeName && (body.type ?? existing.type) !== "EXPENSE") {
				throw new HttpException("Loja só pode ser informada em transações de saída", 400);
			}
			if (body.storeName) await resolveStore(userId, body.storeName);

			// Record history for changed fields
			const historyEntries: Array<{
				transactionId: string;
				field: string;
				oldValue: string | null;
				newValue: string | null;
			}> = [];

			if (body.amount !== undefined && body.amount !== Number(existing.amount)) {
				historyEntries.push({
					field: "amount",
					newValue: String(body.amount),
					oldValue: String(existing.amount),
					transactionId: params.id,
				});
			}
			if (body.description !== undefined && body.description !== existing.description) {
				historyEntries.push({
					field: "description",
					newValue: body.description,
					oldValue: existing.description,
					transactionId: params.id,
				});
			}
			if (body.storeName !== undefined && body.storeName !== existing.storeName) {
				historyEntries.push({
					field: "storeName",
					newValue: body.storeName,
					oldValue: existing.storeName,
					transactionId: params.id,
				});
			}
			if (existing.recurrenceId || existing.salaryId || existing.subscriptionId) {
				historyEntries.push({
					field: "manualEdit",
					newValue: null,
					oldValue: null,
					transactionId: params.id,
				});
			}

			if (historyEntries.length > 0) {
				await executeStatement(db.sql.public.TransactionHistory.insert(historyEntries as never).build());
			}
			const transaction = await queryFirst(
				db.sql.public.Transaction.update({
					...(body.amount !== undefined && { amount: String(body.amount) }),
					...(body.date && { date: new Date(body.date) }),
					...(body.time !== undefined && { time: body.time }),
					...(body.description !== undefined && { description: body.description }),
					...(body.storeName !== undefined && { storeName: body.storeName }),
					...(body.isHidden !== undefined && { isHidden: body.isHidden }),
					...(body.type && { type: body.type }),
					...(body.paymentCreditCardId !== undefined && {
						paymentCreditCardId: body.paymentCreditCardId,
					}),
					...(body.originFinancialAccountId !== undefined && {
						originFinancialAccountId: body.originFinancialAccountId,
					}),
					...(body.destinationFinancialAccountId !== undefined && {
						destinationFinancialAccountId: body.destinationFinancialAccountId,
					}),
					...(tagIds !== undefined && { categoryId: tagIds[0] ?? null }),
					updatedAt: new Date(),
				} as never)
					.where((f, fn) => fn.eq(f.id, params.id))
					.returning(...transactionColumns)
					.build(),
			);
			if (!transaction) throw new HttpException("Transaction not found", 404);
			const changedCards = [
				...new Set(
					[existing.paymentCreditCardId, transaction.paymentCreditCardId].filter((id): id is string =>
						Boolean(id),
					),
				),
			];
			if (changedCards.length) await refreshCardPayments(changedCards);
			await syncTransactionDebtEvent({
				amount: Number(transaction.amount),
				date: transaction.date.toISOString().slice(0, 10),
				debtSplit: body.debtSplit,
				description: transaction.description ?? undefined,
				matchEventId: body.matchDebtEventId,
				transactionId: transaction.id,
				type: transaction.type as "EXPENSE" | "INCOME" | "TRANSFER",
				userId,
			});
			if (tagIds !== undefined) {
				await replaceEntityTags({
					entityIds: [transaction.id],
					entityType: tagEntityType.transaction,
					tagIds,
				});
			}
			const recalculationDate = existing.date < transaction.date ? existing.date : transaction.date;
			for (const accountId of new Set(
				[
					existing.originFinancialAccountId,
					existing.destinationFinancialAccountId,
					transaction.originFinancialAccountId,
					transaction.destinationFinancialAccountId,
				].filter((id): id is string => Boolean(id)),
			))
				await enqueueAccountYieldRecalculation(
					accountId,
					recalculationDate,
					`transaction:${transaction.id}:${Date.now()}`,
				);

			const tagsByTransaction = await getTagsByEntity(tagEntityType.transaction, [transaction.id]);
			const tags = tagsByTransaction.get(transaction.id) ?? [];
			return {
				...transaction,
				debtSplit: await getDebtSplitReturn({ transactionId: transaction.id }, Number(transaction.amount)),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number()),
				categoryId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				date: t.Optional(t.String()),
				debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
				description: t.Optional(t.String({ maxLength: 1000 })),
				destinationFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				isHidden: t.Optional(t.Boolean()),
				matchDebtEventId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				originFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				paymentCreditCardId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				storeName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
				time: t.Optional(t.Nullable(t.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$" }))),
				type: t.Optional(TransactionType),
			}),
			detail: { tags: ["Transactions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertTransactionOwnership(params.id, userId);
			const existing = await queryFirst(
				db.sql.public.Transaction.select(...transactionColumns)
					.where((f, fn) => fn.eq(f.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Transaction not found", 404);
			}

			await replaceEntityTags({
				entityIds: [params.id],
				entityType: tagEntityType.transaction,
				tagIds: [],
			});
			await deleteCreatorDebtEventForTransaction(params.id, userId);
			await executeStatement(
				db.sql.public.Transaction.delete()
					.where((f, fn) => fn.eq(f.id, params.id))
					.build(),
			);
			if (existing.paymentCreditCardId) await refreshCardPayments([existing.paymentCreditCardId]);
			for (const accountId of [existing.originFinancialAccountId, existing.destinationFinancialAccountId])
				if (accountId)
					await enqueueAccountYieldRecalculation(
						accountId,
						existing.date,
						`transaction-delete:${existing.id}`,
					);
			return { success: true };
		},
		{
			detail: { tags: ["Transactions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	);
