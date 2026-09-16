import Elysia, { t } from "elysia";
import {
	assertBalanceAccountOwnership,
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
import {
	deleteCreatorDebtEventForTransaction,
	getDebtSplitInput,
	getDebtSplitReturn,
	linkTransactionToDebt,
	syncTransactionDebtEvent,
} from "~/modules/debts/application";
import { DebtSplitInputDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";
import { materializeSalaryTransactions } from "~/modules/salaries/application/materialize-salary-transactions";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows, withTransaction } from "~/shared/infra/sql";

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
	"creditCardStatementId",
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

const TransactionType = t.Union([t.Literal("INCOME"), t.Literal("EXPENSE"), t.Literal("TRANSFER")]);
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const toCents = (amount: number | string) => Math.round(Number(amount) * 100);
const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

function resolveTransactionTime(value: string | null | undefined): string | null {
	if (value === null) return null;
	if (value !== undefined) {
		if (!timePattern.test(value)) throw new HttpException("Informe um horário válido", 400);
		return value;
	}
	return new Date().toTimeString().slice(0, 5);
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
				left.date.toISOString().slice(0, 10) !== right.date.toISOString().slice(0, 10) ||
				Number(left.amount) !== Number(right.amount) ||
				!(
					(left.type === "EXPENSE" && right.type === "INCOME") ||
					(left.type === "INCOME" && right.type === "EXPENSE")
				)
			)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
			const references = await queryRows(
				db.sql.public.TransactionExternalReference.select("externalId", "financialAccountId", "transactionId")
					.where((fields, functions) => functions.in(fields.transactionId, [left.id, right.id]))
					.build(),
			);
			const accountFor = (transactionId: string) =>
				references.find(reference => reference.transactionId === transactionId)?.financialAccountId;
			const outgoing = left.type === "EXPENSE" ? left : right;
			const incoming = left.type === "INCOME" ? left : right;
			const outgoingAccountId = accountFor(outgoing.id);
			const incomingAccountId = accountFor(incoming.id);
			if (!outgoingAccountId || !incomingAccountId || outgoingAccountId === incomingAccountId)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
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
						creditCardStatementId: null,
						destinationFinancialAccountId: incomingAccountId,
						originFinancialAccountId: outgoingAccountId,
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
	.get(
		"/",
		async ({ query, request }) => {
			const userId = await requireUserId(request);
			await materializeSalaryTransactions(userId);
			if (query.financialAccountId) {
				await assertDirectOwnership("FinancialAccount", query.financialAccountId, userId);
			}
			if (query.categoryId) await assertDirectOwnership("Category", query.categoryId, userId);
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
			const paymentStatement = db.sql.public.CreditCardStatement.select(
				"id",
				"creditCardId",
				"statementDate",
			).as("paymentStatement");
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
				.outerLeftJoin(paymentStatement, (f, fn) =>
					fn.eq(f.Transaction.creditCardStatementId, f.paymentStatement.id),
				)
				.outerLeftJoin(paymentCard, (f, fn) => fn.eq(f.paymentStatement.creditCardId, f.paymentCard.id))
				.outerLeftJoin(paymentCardAccount, (f, fn) =>
					fn.eq(f.paymentCard.financialAccountId, f.paymentCardAccount.id),
				)
				.outerLeftJoin(paymentCardInstitution, (f, fn) =>
					fn.eq(f.paymentCardAccount.institutionId, f.paymentCardInstitution.id),
				)
				.outerLeftJoin(db.sql.public.RecurringPayment, (f, fn) =>
					fn.eq(f.Transaction.recurrenceId, f.RecurringPayment.id),
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
					creditCardStatementDate: f.paymentStatement.statementDate,
					creditCardStatementId: f.Transaction.creditCardStatementId,
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
						fn.eq(f.RecurringPayment.userId, userId),
						fn.eq(f.Salary.userId, userId),
						fn.eq(f.Subscription.userId, userId),
					),
				);

			if (query.startDate) {
				queryBuilder = queryBuilder.where((f, fn) => fn.gte(f.Transaction.date, new Date(query.startDate!)));
			}
			if (query.endDate) {
				queryBuilder = queryBuilder.where((f, fn) => fn.lte(f.Transaction.date, new Date(query.endDate!)));
			}
			if (query.type) {
				queryBuilder = queryBuilder.where((f, fn) => fn.eq(f.Transaction.type, query.type!));
			}
			if (query.categoryId && taggedTransactionIds?.length) {
				queryBuilder = queryBuilder.where((f, fn) => fn.in(f.Transaction.id, taggedTransactionIds!));
			}
			if (query.financialAccountId) {
				queryBuilder = queryBuilder.where((f, fn) =>
					fn.or(
						fn.eq(f.Transaction.originFinancialAccountId, query.financialAccountId!),
						fn.eq(f.Transaction.destinationFinancialAccountId, query.financialAccountId!),
					),
				);
			}

			const transactions = taggedTransactionIds?.length === 0 ? [] : await queryRows(queryBuilder.build());
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
				time: string | null;
				sourceName: string;
			}> = [];
			if (!query.type || query.type === "EXPENSE" || query.type === "INCOME") {
				let purchaseQuery = db.sql.public.CreditPurchase.innerJoin(
					db.sql.public.CreditCardStatement,
					(f, fn) => fn.eq(f.CreditPurchase.statementId, f.CreditCardStatement.id),
				)
					.innerJoin(db.sql.public.CreditCard, (f, fn) =>
						fn.eq(f.CreditCardStatement.creditCardId, f.CreditCard.id),
					)
					.innerJoin(db.sql.public.FinancialAccount, (f, fn) =>
						fn.eq(f.CreditCard.financialAccountId, f.FinancialAccount.id),
					)
					.outerLeftJoin(db.sql.public.FinancialInstitution, (f, fn) =>
						fn.eq(f.FinancialAccount.institutionId, f.FinancialInstitution.id),
					)
					.outerLeftJoin(db.sql.public.Category, (f, fn) => fn.eq(f.CreditPurchase.categoryId, f.Category.id))
					.select((f, fn) => ({
						amount: f.CreditPurchase.totalAmount,
						categoryColor: f.Category.color,
						categoryName: f.Category.name,
						createdAt: f.CreditPurchase.createdAt,
						creditCardId: f.CreditCard.id,
						currentInstallment: f.CreditPurchase.currentInstallment,
						date: f.CreditPurchase.purchaseDate,
						description: f.CreditPurchase.description,
						feeAmount: f.CreditPurchase.feeAmount,
						feeDescription: f.CreditPurchase.feeDescription,
						id: f.CreditPurchase.id,
						installmentAmount: f.CreditPurchase.installmentAmount,
						installments: f.CreditPurchase.installments,
						isRefund: f.CreditPurchase.isRefund,
						originAccountType: fn.raw`'CREDIT_CARD'`.returns("sql/varchar@1"),
						originFinancialAccountId: f.FinancialAccount.id,
						refundOfPurchaseId: f.CreditPurchase.refundOfPurchaseId,
						sourceName:
							fn.raw`COALESCE(${f.FinancialAccount.name}, ${f.FinancialInstitution.name}, 'Cartão de crédito')`.returns(
								"sql/varchar@1",
							),
						statementId: f.CreditPurchase.statementId,
						storeName: f.CreditPurchase.storeName,
						time: f.CreditPurchase.time,
					}))
					.where((f, fn) =>
						fn.and(fn.eq(f.FinancialAccount.userId, userId), fn.eq(f.CreditPurchase.currentInstallment, 1)),
					);
				if (query.startDate)
					purchaseQuery = purchaseQuery.where((f, fn) =>
						fn.gte(f.CreditPurchase.purchaseDate, new Date(query.startDate!)),
					);
				if (query.endDate)
					purchaseQuery = purchaseQuery.where((f, fn) =>
						fn.lte(f.CreditPurchase.purchaseDate, new Date(query.endDate!)),
					);
				if (query.financialAccountId)
					purchaseQuery = purchaseQuery.where((f, fn) =>
						fn.eq(f.FinancialAccount.id, query.financialAccountId!),
					);
				if (query.type === "EXPENSE")
					purchaseQuery = purchaseQuery.where((f, fn) => fn.eq(f.CreditPurchase.isRefund, false));
				if (query.type === "INCOME")
					purchaseQuery = purchaseQuery.where((f, fn) => fn.eq(f.CreditPurchase.isRefund, true));
				purchases = await queryRows(purchaseQuery.build());
			}
			const purchaseTags = await getTagsByEntity(
				tagEntityType.creditPurchase,
				purchases.map(purchase => purchase.id),
			);
			const purchaseIds = purchases.filter(purchase => !purchase.isRefund).map(purchase => purchase.id);
			const refundedPurchases = purchaseIds.length
				? await queryRows(
						db.sql.public.CreditPurchase.select("id", "purchaseDate", "refundOfPurchaseId", "totalAmount")
							.where((fields, functions) => functions.in(fields.refundOfPurchaseId, purchaseIds))
							.build(),
					)
				: [];
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
							amount: purchase.isRefund ? Math.abs(Number(purchase.amount)) : Number(purchase.amount),
							creditCardStatementId: purchase.statementId,
							debtSplit: await getDebtSplitReturn(
								{ creditPurchaseId: purchase.id },
								Math.abs(Number(purchase.amount)),
							),
							destinationFinancialAccountId: null,
							destinationName: null,
							hasRefund: !purchase.isRefund && refundsByPurchaseId.has(purchase.id),
							originName: purchase.sourceName,
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
							tagIds: tags.map(tag => tag.id),
							tags,
							type: purchase.isRefund ? ("INCOME" as const) : ("EXPENSE" as const),
						};
					}),
				)
			).filter(purchase => !query.categoryId || purchase.tagIds.includes(query.categoryId));

			const sortedTransactions = [...normalizedTransactions, ...normalizedPurchases].sort(
				(left, right) =>
					new Date(right.date).getTime() - new Date(left.date).getTime() ||
					new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
			);

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
				endDate: t.Optional(t.String()),
				financialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				limit: t.Optional(t.Number({ maximum: 500, minimum: 1 })),
				offset: t.Optional(t.Number({ minimum: 0 })),
				startDate: t.Optional(t.String()),
				type: t.Optional(TransactionType),
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
			let statement: { id: string; paidAmount: number; statementDate: Date; totalAmount: number } | undefined;
			if (body.creditCardStatementId) {
				if ((body.type ?? "EXPENSE") !== "EXPENSE") {
					throw new HttpException("Apenas saídas podem pagar uma fatura", 400);
				}
				statement = await queryFirst(
					db.sql.public.CreditCardStatement.innerJoin(db.sql.public.CreditCard, (fields, functions) =>
						functions.eq(fields.CreditCardStatement.creditCardId, fields.CreditCard.id),
					)
						.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
							functions.eq(fields.CreditCard.financialAccountId, fields.FinancialAccount.id),
						)
						.select(fields => ({
							id: fields.CreditCardStatement.id,
							paidAmount: fields.CreditCardStatement.paidAmount,
							statementDate: fields.CreditCardStatement.statementDate,
							totalAmount: fields.CreditCardStatement.totalAmount,
						}))
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.CreditCardStatement.id, body.creditCardStatementId!),
								functions.eq(fields.FinancialAccount.userId, userId),
							),
						)
						.limit(1)
						.build(),
				);
				if (!statement) throw new HttpException("Fatura não encontrada", 404);
			}
			if (body.recurrenceId) await assertDirectOwnership("RecurringPayment", body.recurrenceId, userId);
			if (body.salaryId) await assertDirectOwnership("Salary", body.salaryId, userId);
			if (body.subscriptionId) await assertDirectOwnership("Subscription", body.subscriptionId, userId);
			let originFinancialAccountId = body.originFinancialAccountId;
			let inheritedPaymentAccount = false;
			let inheritedStoreName: string | null | undefined;
			if (body.recurrenceId) {
				const recurringPayment = await queryFirst(
					db.sql.public.RecurringPayment.select("financialAccountId", "storeName")
						.where((fields, functions) => functions.eq(fields.id, body.recurrenceId!))
						.limit(1)
						.build(),
				);
				inheritedStoreName = recurringPayment?.storeName;
				if (!originFinancialAccountId && !body.destinationFinancialAccountId) {
					originFinancialAccountId = recurringPayment?.financialAccountId ?? undefined;
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
				? { entityId: body.recurrenceId, entityType: tagEntityType.recurringPayment }
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
			let transaction = await findExistingOccurrence();
			let wasCreated = false;
			if (!transaction) {
				try {
					transaction = await queryFirst(
						db.sql.public.Transaction.insert([
							{
								amount: String(body.amount),
								categoryId: tagIds[0],
								creditCardStatementId: body.creditCardStatementId,
								date: new Date(body.date),
								description: body.description,
								destinationFinancialAccountId: body.destinationFinancialAccountId,
								isHidden: body.isHidden ?? false,
								originFinancialAccountId,
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
				if (statement) {
					const paidAmount = (toCents(statement.paidAmount) + toCents(body.amount)) / 100;
					await executeStatement(
						db.sql.public.CreditCardStatement.update({
							isPaid:
								toDateKey(statement.statementDate) <= toDateKey(new Date()) &&
								toCents(paidAmount) >= toCents(statement.totalAmount),
							paidAmount: String(paidAmount),
							updatedAt: new Date(),
						})
							.where((fields, functions) => functions.eq(fields.id, statement!.id))
							.build(),
					);
				}
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
				creditCardStatementId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				date: t.String(),
				debtSplit: t.Optional(DebtSplitInputDTO),
				description: t.Optional(t.String({ maxLength: 1000 })),
				destinationFinancialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				isHidden: t.Optional(t.Boolean()),
				matchDebtEventId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				originFinancialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
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
				(existing.creditCardStatementId || body.creditCardStatementId) &&
				(body.type ?? existing.type) !== "EXPENSE"
			) {
				throw new HttpException("A transação vinculada à fatura deve ser uma saída", 400);
			}
			if (body.creditCardStatementId) {
				const statement = await queryFirst(
					db.sql.public.CreditCardStatement.innerJoin(db.sql.public.CreditCard, (fields, functions) =>
						functions.eq(fields.CreditCardStatement.creditCardId, fields.CreditCard.id),
					)
						.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
							functions.eq(fields.CreditCard.financialAccountId, fields.FinancialAccount.id),
						)
						.select("id")
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.CreditCardStatement.id, body.creditCardStatementId!),
								functions.eq(fields.FinancialAccount.userId, userId),
							),
						)
						.limit(1)
						.build(),
				);
				if (!statement) throw new HttpException("Fatura não encontrada", 404);
			}
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
					...(body.creditCardStatementId !== undefined && {
						creditCardStatementId: body.creditCardStatementId,
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
			const previousStatementId = existing.creditCardStatementId;
			const nextStatementId = transaction.creditCardStatementId;
			if (previousStatementId || nextStatementId) {
				const statementIds = [...new Set([previousStatementId, nextStatementId].filter(Boolean))];
				const statements = await queryRows(
					db.sql.public.CreditCardStatement.select("id", "paidAmount", "statementDate", "totalAmount")
						.where((fields, functions) => functions.in(fields.id, statementIds))
						.build(),
				);
				for (const statement of statements) {
					const paidAmount =
						(toCents(statement.paidAmount) -
							(statement.id === previousStatementId ? toCents(existing.amount) : 0) +
							(statement.id === nextStatementId ? toCents(transaction.amount) : 0)) /
						100;
					await executeStatement(
						db.sql.public.CreditCardStatement.update({
							isPaid:
								toDateKey(statement.statementDate) <= toDateKey(new Date()) &&
								toCents(paidAmount) >= toCents(statement.totalAmount),
							paidAmount: String(Math.max(0, paidAmount)),
							updatedAt: new Date(),
						})
							.where((fields, functions) => functions.eq(fields.id, statement.id))
							.build(),
					);
				}
			}
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
				creditCardStatementId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				date: t.Optional(t.String()),
				debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
				description: t.Optional(t.String({ maxLength: 1000 })),
				destinationFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				isHidden: t.Optional(t.Boolean()),
				matchDebtEventId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				originFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
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
			if (existing.creditCardStatementId) {
				const statement = await queryFirst(
					db.sql.public.CreditCardStatement.select("id", "paidAmount", "statementDate", "totalAmount")
						.where((fields, functions) => functions.eq(fields.id, existing.creditCardStatementId!))
						.limit(1)
						.build(),
				);
				if (!statement) throw new HttpException("Fatura não encontrada", 404);
				const paidAmount = Math.max(0, (toCents(statement.paidAmount) - toCents(existing.amount)) / 100);
				await executeStatement(
					db.sql.public.CreditCardStatement.update({
						isPaid:
							toDateKey(statement.statementDate) <= toDateKey(new Date()) &&
							toCents(paidAmount) >= toCents(statement.totalAmount),
						paidAmount: String(paidAmount),
						updatedAt: new Date(),
					})
						.where((fields, functions) => functions.eq(fields.id, statement.id))
						.build(),
				);
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
			return { success: true };
		},
		{
			detail: { tags: ["Transactions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	);
