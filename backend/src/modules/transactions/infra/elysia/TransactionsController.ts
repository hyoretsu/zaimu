import { convertFixedSplitAtDate } from "@zaimu/finance/money";
import { resolveTransactionMoneySides } from "@zaimu/finance/transaction-money";
import Elysia, { t } from "elysia";
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
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import { defaultCurrency } from "~/modules/currencies/application/currency-defaults";
import {
	CurrencyDTO,
	creditCardCurrency,
	FinancialFeeDTO,
	financialAccountCurrency,
	resolveFinancialMoney,
} from "~/modules/currencies/application/financial-money";
import { ensureCurrencyRates } from "~/modules/currencies/infra/currency-exchange";
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
import { transferCandidatePairs } from "~/modules/transactions/application/transfer-candidate-pairs";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { rejectLegacyFinancialFields } from "~/shared/infra/elysia/strict-json-body";
import { db, executeStatement, queryFirst, queryRaw, queryRows, withTransaction } from "~/shared/infra/sql";

const transactionColumns = [
	"id",
	"amount",
	"currency",
	"bookingCurrency",
	"destinationAmount",
	"destinationCurrency",
	"paymentAmount",
	"paymentCurrency",
	"conversionSource",
	"originalAmount",
	"fees",
	"exchangeRate",
	"date",
	"time",
	"description",
	"storeName",
	"isHidden",
	"type",
	"paymentCreditCardId",
	"recurrenceId",
	"recurrenceOccurrenceDate",
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
	.onTransform(({ body }) => {
		rejectLegacyFinancialFields(body);
	})
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
	.get("/transfer-suggestions", async ({ request, set }) => {
		const userId = await requireUserId(request);
		const cached = await distributedCache.remember(
			userId,
			"transactions:list",
			{ view: "transfer-suggestions" },
			async () => {
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
				return transferCandidatePairs(candidates, rejectedPairs);
			},
		);
		set.headers.etag = cached.etag;
		set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
		if (request.headers.get("if-none-match") === cached.etag) {
			set.status = 304;
			return undefined;
		}
		return cached.value;
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
			const cached = await distributedCache.remember(
				userId,
				"transactions:list",
				{ format: 4, ...query },
				async () => {
					if (query.financialAccountId)
						await assertDirectOwnership("FinancialAccount", query.financialAccountId, userId);
					if (query.categoryId) await assertDirectOwnership("Category", query.categoryId, userId);
					return listTransactionsPage(userId, query);
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return null;
			}
			return cached.value;
		},
		{
			detail: { tags: ["Transactions"] },
			query: t.Object({
				categoryId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				cursor: t.Optional(t.String({ maxLength: 2048, minLength: 1 })),
				endDate: t.Optional(t.String()),
				financialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				limit: t.Optional(t.Integer({ maximum: 100, minimum: 1 })),
				search: t.Optional(t.String({ maxLength: 200 })),
				source: t.Optional(TransactionSource),
				startDate: t.Optional(t.String()),
				type: t.Optional(TransactionFilterType),
				visibility: t.Optional(TransactionVisibility),
			}),
		},
	)
	.get(
		"/:id",
		async ({ params, request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				`transactions:detail:${params.id}`,
				{ format: 3 },
				async () => {
					const transaction = await queryFirst(
						db.sql.public.Transaction.select(...transactionColumns)
							.where((f, fn) => fn.and(fn.eq(f.id, params.id), fn.eq(f.userId, userId)))
							.limit(1)
							.build(),
					);
					if (!transaction) throw new HttpException("Transaction not found", 404);
					await ensureCurrencyRates(
						transaction.date,
						transaction.currency,
						await financialAccountCurrency(
							(transaction.type === "INCOME"
								? transaction.destinationFinancialAccountId
								: transaction.originFinancialAccountId) ?? transaction.destinationFinancialAccountId,
							transaction.bookingCurrency,
						),
					);
					const [tagsByTransaction, debtSplit] = await Promise.all([
						getTagsByEntity(tagEntityType.transaction, [transaction.id]),
						getDebtSplitReturn({ transactionId: transaction.id }, Number(transaction.amount)),
					]);
					const tags = tagsByTransaction.get(transaction.id) ?? [];
					return { ...transaction, debtSplit, tagIds: tags.map(tag => tag.id), tags };
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return null;
			}
			return cached.value;
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
			const hasExplicitTags = body.tagIds !== undefined;
			const linkedTagSource = body.recurrenceId
				? { entityId: body.recurrenceId, entityType: "RECURRENCE" }
				: undefined;
			const tagIds = hasExplicitTags
				? await assertTagOwnership(body.tagIds ?? [], userId)
				: linkedTagSource
					? ((await getTagsByEntity(linkedTagSource.entityType, [linkedTagSource.entityId]))
							.get(linkedTagSource.entityId)
							?.map(tag => tag.id) ?? [])
					: [];
			if (!originFinancialAccountId && !body.destinationFinancialAccountId && !body.recurrenceId) {
				throw new HttpException("Informe uma conta financeira ou recorrência", 400);
			}
			const storeName = body.storeName ?? inheritedStoreName;
			if (storeName && (body.type ?? "EXPENSE") !== "EXPENSE") {
				throw new HttpException("Loja só pode ser informada em transações de saída", 400);
			}
			if (storeName) await resolveStore(userId, storeName);
			const recurrenceOccurrenceDate = body.recurrenceId
				? new Date(body.recurrenceOccurrenceDate ?? body.date)
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
			const money = await resolveFinancialMoney({
				amount: body.amount,
				currency: body.currency,
				date: body.date,
				fees:
					body.fees ??
					(body.feeAmount
						? [{ amount: body.feeAmount, name: body.feeDescription ?? "Taxa", type: "FIXED" }]
						: []),
				targetCurrency: await financialAccountCurrency(
					(body.type === "INCOME" ? body.destinationFinancialAccountId : originFinancialAccountId) ??
						body.destinationFinancialAccountId,
					body.currency ?? (await defaultCurrency(userId, request.headers.get("X-Currency"))),
				),
			});
			const sides = await resolveTransactionMoneySides(
				{
					amount: money.amount,
					currency: money.bookingCurrency,
					destinationAmount: body.destinationAmount,
					destinationCurrency: body.destinationFinancialAccountId
						? await financialAccountCurrency(body.destinationFinancialAccountId)
						: null,
					paymentAmount: body.paymentAmount,
					paymentCurrency: body.paymentCreditCardId
						? await creditCardCurrency(body.paymentCreditCardId)
						: null,
				},
				(from, to) => ensureCurrencyRates(body.date, from, to),
			);
			await lockPaymentResources(body.paymentCreditCardId, originFinancialAccountId);
			let transaction = await findExistingOccurrence();
			let wasCreated = false;
			if (!transaction) {
				try {
					transaction = await queryFirst(
						db.sql.public.Transaction.insert([
							{
								amount: String(money.amount),
								bookingCurrency: money.bookingCurrency,
								conversionSource: sides.conversionSource,
								currency: money.currency,
								date: new Date(body.date),
								description: body.description,
								destinationAmount: sides.destinationAmount == null ? null : String(sides.destinationAmount),
								destinationCurrency: sides.destinationCurrency,
								destinationFinancialAccountId: body.destinationFinancialAccountId,
								exchangeRate: String(money.exchangeRate),
								fees: money.fees,
								isHidden: body.isHidden ?? false,
								originalAmount: String(money.originalAmount),
								originFinancialAccountId,
								paymentAmount: sides.paymentAmount == null ? null : String(sides.paymentAmount),
								paymentCreditCardId: body.paymentCreditCardId,
								paymentCurrency: sides.paymentCurrency,
								recurrenceId: body.recurrenceId,
								recurrenceOccurrenceDate,
								storeName,
								time: body.recurrenceId ? null : resolveTransactionTime(body.time),
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
					? await getDebtSplitInput({ recurrenceId: body.recurrenceId })
					: undefined;
				await linkTransactionToDebt({
					amount: Number(transaction.amount),
					date: body.date,
					debtSplit: await convertFixedSplitAtDate(
						inheritedDebtSplit ?? body.debtSplit,
						body.date,
						money.currency,
						money.bookingCurrency,
						ensureCurrencyRates,
					),
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
				amount: Number(transaction.amount),
				debtSplit: await getDebtSplitReturn({ transactionId: transaction.id }, Number(transaction.amount)),
				destinationAmount:
					transaction.destinationAmount == null ? null : Number(transaction.destinationAmount),
				paymentAmount: transaction.paymentAmount == null ? null : Number(transaction.paymentAmount),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Number(),
				currency: t.Optional(CurrencyDTO),
				date: t.String(),
				debtSplit: t.Optional(DebtSplitInputDTO),
				description: t.Optional(t.String({ maxLength: 1000 })),
				destinationAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				destinationFinancialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				feeAmount: t.Optional(t.Number({ minimum: 0 })),
				feeDescription: t.Optional(t.String({ maxLength: 100 })),
				fees: t.Optional(t.Array(FinancialFeeDTO, { maxItems: 20 })),
				isHidden: t.Optional(t.Boolean()),
				matchDebtEventId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				originFinancialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				paymentAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				paymentCreditCardId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				recurrenceId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				recurrenceOccurrenceDate: t.Optional(t.String()),
				storeName: t.Optional(t.String({ maxLength: 200 })),
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
				body.tagIds !== undefined ? await assertTagOwnership(body.tagIds ?? [], userId) : undefined;
			const existing = await queryFirst(
				db.sql.public.Transaction.select(...transactionColumns)
					.where((f, fn) => fn.eq(f.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Transaction not found", 404);
			}
			await lockPaymentResources(
				body.paymentCreditCardId ?? existing.paymentCreditCardId,
				body.originFinancialAccountId ?? existing.originFinancialAccountId,
			);
			const transactionType = body.type ?? existing.type;
			const originFinancialAccountId =
				body.originFinancialAccountId !== undefined
					? body.originFinancialAccountId
					: existing.originFinancialAccountId;
			const destinationFinancialAccountId =
				body.destinationFinancialAccountId !== undefined
					? body.destinationFinancialAccountId
					: existing.destinationFinancialAccountId;
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

			const moneyChanged =
				body.amount !== undefined ||
				body.currency !== undefined ||
				body.fees !== undefined ||
				body.feeAmount !== undefined ||
				body.date !== undefined ||
				body.originFinancialAccountId !== undefined ||
				body.destinationFinancialAccountId !== undefined ||
				body.type !== undefined;
			const money = moneyChanged
				? await resolveFinancialMoney({
						amount: body.amount ?? Number(existing.originalAmount ?? existing.amount),
						currency: body.currency ?? existing.currency,
						date: body.date ?? existing.date,
						fees:
							body.fees ??
							(body.feeAmount !== undefined
								? body.feeAmount
									? [{ amount: body.feeAmount, name: body.feeDescription ?? "Taxa", type: "FIXED" }]
									: []
								: (existing.fees as never)),
						targetCurrency: await financialAccountCurrency(
							(transactionType === "INCOME" ? destinationFinancialAccountId : originFinancialAccountId) ??
								destinationFinancialAccountId,
							body.currency ??
								existing.bookingCurrency ??
								(await defaultCurrency(userId, request.headers.get("X-Currency"))),
						),
					})
				: undefined;
			const paymentCreditCardId =
				body.paymentCreditCardId !== undefined ? body.paymentCreditCardId : existing.paymentCreditCardId;
			const sidesChanged =
				moneyChanged ||
				body.destinationAmount !== undefined ||
				body.paymentAmount !== undefined ||
				body.paymentCreditCardId !== undefined;
			const sides = sidesChanged
				? await resolveTransactionMoneySides(
						{
							amount: money?.amount ?? Number(existing.amount),
							currency: money?.bookingCurrency ?? existing.bookingCurrency,
							destinationAmount:
								body.destinationAmount ??
								(!moneyChanged && body.destinationFinancialAccountId === undefined
									? existing.destinationAmount == null
										? undefined
										: Number(existing.destinationAmount)
									: undefined),
							destinationCurrency: destinationFinancialAccountId
								? await financialAccountCurrency(destinationFinancialAccountId)
								: null,
							paymentAmount:
								body.paymentAmount ??
								(!moneyChanged && body.paymentCreditCardId === undefined
									? existing.paymentAmount == null
										? undefined
										: Number(existing.paymentAmount)
									: undefined),
							paymentCurrency: paymentCreditCardId ? await creditCardCurrency(paymentCreditCardId) : null,
						},
						(from, to) => ensureCurrencyRates(body.date ?? existing.date, from, to),
					)
				: undefined;
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
			if (existing.recurrenceId) {
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
					...(sides && {
						conversionSource: sides.conversionSource,
						destinationAmount: sides.destinationAmount == null ? null : String(sides.destinationAmount),
						destinationCurrency: sides.destinationCurrency,
						paymentAmount: sides.paymentAmount == null ? null : String(sides.paymentAmount),
						paymentCurrency: sides.paymentCurrency,
					}),
					...(money && {
						amount: String(money.amount),
						bookingCurrency: money.bookingCurrency,
						currency: money.currency,
						exchangeRate: String(money.exchangeRate),
						fees: money.fees,
						originalAmount: String(money.originalAmount),
					}),
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
				debtSplit: await convertFixedSplitAtDate(
					body.debtSplit,
					transaction.date,
					transaction.currency ?? "BRL",
					transaction.bookingCurrency ?? "BRL",
					ensureCurrencyRates,
				),
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
				amount: Number(transaction.amount),
				debtSplit: await getDebtSplitReturn({ transactionId: transaction.id }, Number(transaction.amount)),
				destinationAmount:
					transaction.destinationAmount == null ? null : Number(transaction.destinationAmount),
				paymentAmount: transaction.paymentAmount == null ? null : Number(transaction.paymentAmount),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number()),
				currency: t.Optional(CurrencyDTO),
				date: t.Optional(t.String()),
				debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
				description: t.Optional(t.String({ maxLength: 1000 })),
				destinationAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				destinationFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				feeAmount: t.Optional(t.Number({ minimum: 0 })),
				feeDescription: t.Optional(t.String({ maxLength: 100 })),
				fees: t.Optional(t.Array(FinancialFeeDTO, { maxItems: 20 })),
				isHidden: t.Optional(t.Boolean()),
				matchDebtEventId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				originFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				paymentAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
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

async function lockPaymentResources(cardId: string | null | undefined, accountId: string | null | undefined) {
	if (cardId) await queryRaw(`SELECT "id" FROM "CreditCard" WHERE "id"=$1 FOR UPDATE`, [cardId]);
	if (accountId) await queryRaw(`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 FOR UPDATE`, [accountId]);
}
