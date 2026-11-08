import { convertFixedSplitAtDate, isCryptoAsset } from "@zaimu/finance/money";
import { TransactionMoneyError } from "@zaimu/finance/transaction-money";
import Elysia, { t } from "elysia";
import {
	assertBalanceAccountOwnership,
	assertCreditCardOwnership,
	assertDirectOwnership,
	assertTransactionOwnership,
	isPointsAccount,
	requireUserId,
} from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import {
	creditCardCurrency,
	financialAccountCurrency,
	resolveAssetFinancialMoney,
	resolveAssetTransactionMoneySides,
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
import {
	db,
	executeStatement,
	nullableNumeric,
	numeric,
	queryFirst,
	queryRows,
	withTransaction,
} from "~/shared/infra/sql";

const AssetCodeDTO = t.String({ pattern: "^[A-Za-z0-9]{2,12}$" });
const AssetAmountDTO = t.String({ pattern: "^\\d{1,20}(\\.\\d{1,18})?$" });
const AssetFeeDTO = t.Object({
	amount: AssetAmountDTO,
	assetCode: t.Optional(AssetCodeDTO),
	name: t.String({ maxLength: 100, minLength: 1 }),
	type: t.Union([t.Literal("FIXED"), t.Literal("PERCENTAGE")]),
});
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

/** Date-only columns arrive as `YYYY-MM-DD`; the API contract keeps serializing them as UTC-midnight instants. */
const withDateInstants = <Row extends { date: string; recurrenceOccurrenceDate: string | null }>(
	row: Row,
) => ({
	...row,
	date: new Date(`${row.date}T00:00:00Z`),
	recurrenceOccurrenceDate: row.recurrenceOccurrenceDate
		? new Date(`${row.recurrenceOccurrenceDate}T00:00:00Z`)
		: null,
});

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

async function resolveSides(...args: Parameters<typeof resolveAssetTransactionMoneySides>) {
	try {
		return await resolveAssetTransactionMoneySides(...args);
	} catch (error) {
		if (error instanceof TransactionMoneyError) throw new HttpException(error.message, 400);
		throw error;
	}
}

export const TransactionsController = new Elysia({
	detail: { tags: ["Transactions"] },
	prefix: "/transactions",
})
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
			if (transactions.length !== 2)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
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
				db.sql.public.TransactionExternalReference.select(
					"externalId",
					"financialAccountId",
					"transactionId",
				)
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
				const removedReferences = references.filter(
					reference => reference.transactionId === removed.id,
				);
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
			const changedCards = [
				...new Set(
					[left.paymentCreditCardId, right.paymentCreditCardId].filter((id): id is string =>
						Boolean(id),
					),
				),
			];
			if (changedCards.length) await refreshCardPayments(changedCards);
			const recalculationDate = new Date(left.date) < new Date(right.date) ? left.date : right.date;
			for (const accountId of [outgoingAccountId, incomingAccountId])
				await enqueueAccountYieldRecalculation(
					accountId,
					new Date(recalculationDate),
					`transfer-suggestion:${retained.id}`,
				);
			return { success: true };
		},
		{
			detail: { operationId: "postTransactionsByIdTransferSuggestionsByCounterpartIdAccept" },
			params: t.Object({
				counterpartId: t.String({ maxLength: 36, minLength: 1 }),
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get(
		"/transfer-suggestions",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"transactions:list",
				{ view: "transfer-suggestions" },
				async () => {
					const [transactions, rejections] = await Promise.all([
						queryRows(
							db.sql.public.Transaction.innerJoin(
								db.sql.public.FinancialAccount,
								(fields, functions) =>
									functions.or(
										functions.and(
											functions.eq(fields.Transaction.type, "EXPENSE"),
											functions.eq(
												fields.Transaction.originFinancialAccountId,
												fields.FinancialAccount.id,
											),
										),
										functions.and(
											functions.eq(fields.Transaction.type, "INCOME"),
											functions.eq(
												fields.Transaction.destinationFinancialAccountId,
												fields.FinancialAccount.id,
											),
										),
									),
							)
								.outerLeftJoin(db.sql.public.FinancialInstitution, (fields, functions) =>
									functions.eq(
										fields.FinancialAccount.institutionId,
										fields.FinancialInstitution.id,
									),
								)
								.select((fields, functions) => ({
									accountName:
										functions.raw`COALESCE(${fields.FinancialAccount.name}, ${fields.FinancialInstitution.name})`.returns(
											"sql/varchar@1",
										),
									accountType: fields.FinancialAccount.type,
									amount: fields.Transaction.amount,
									bookingCurrency: fields.Transaction.bookingCurrency,
									createdAt: fields.Transaction.createdAt,
									date: fields.Transaction.date,
									description: fields.Transaction.description,
									destinationFinancialAccountId:
										fields.Transaction.destinationFinancialAccountId,
									id: fields.Transaction.id,
									isHidden: fields.Transaction.isHidden,
									originFinancialAccountId: fields.Transaction.originFinancialAccountId,
									storeName: fields.Transaction.storeName,
									time: fields.Transaction.time,
									type: fields.Transaction.type,
								}))
								.where((fields, functions) =>
									functions.and(
										functions.eq(fields.FinancialAccount.userId, userId),
										functions.raw`${fields.Transaction.time} IS NOT NULL`.returns(
											"pg/bool@1",
										),
									),
								)
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
						rejections.map(
							rejection => `${rejection.firstTransactionId}:${rejection.secondTransactionId}`,
						),
					);
					const candidates = transactions
						.filter(transaction => !isCryptoAsset(transaction.bookingCurrency))
						.map(transaction => ({
							...transaction,
							amount: Number(transaction.amount),
							destinationAccountType:
								transaction.type === "INCOME" ? transaction.accountType : null,
							destinationName: transaction.type === "INCOME" ? transaction.accountName : null,
							originAccountType:
								transaction.type === "EXPENSE" ? transaction.accountType : null,
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
		},
		{ detail: { operationId: "getTransactionsTransferSuggestions" } },
	)
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
			if (transactions.length !== 2)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
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
			detail: { operationId: "postTransactionsByIdTransferSuggestionsByCounterpartIdReject" },
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
				{ format: 5, ...query },
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
			detail: { operationId: "getTransactions", tags: ["Transactions"] },
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
								: transaction.originFinancialAccountId) ??
								transaction.destinationFinancialAccountId,
							transaction.bookingCurrency,
						),
					);
					const [tagsByTransaction, debtSplit] = await Promise.all([
						getTagsByEntity(tagEntityType.transaction, [transaction.id]),
						getDebtSplitReturn({ transactionId: transaction.id }, Number(transaction.amount)),
					]);
					const tags = tagsByTransaction.get(transaction.id) ?? [];
					return {
						...withDateInstants(transaction),
						debtSplit,
						tagIds: tags.map(tag => tag.id),
						tags,
					};
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
			detail: { operationId: "getTransactionsById", tags: ["Transactions"] },
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
			detail: { operationId: "getTransactionsByIdHistory", tags: ["Transactions"] },
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
						allowPoints: (body.type ?? "EXPENSE") !== "INCOME",
					});
			}
			if (body.destinationFinancialAccountId) {
				await assertBalanceAccountOwnership(body.destinationFinancialAccountId, userId, {
					allowCashback: (body.type ?? "EXPENSE") === "INCOME",
					allowPoints: (body.type ?? "EXPENSE") === "INCOME" || body.type === "TRANSFER",
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
				? (body.recurrenceOccurrenceDate ?? body.date)
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
				const scheduledDate = recurrenceOccurrenceDate;
				await materializeRecurrence(userId, body.recurrenceId, scheduledDate, {
					from: scheduledDate,
					through: scheduledDate,
				});
				const concrete = await findExistingOccurrence();
				if (!concrete)
					throw new HttpException(
						"Ocorrência indisponível, excluída ou pertencente ao cartão",
						409,
					);
			}
			const money = await resolveAssetFinancialMoney({
				amount: body.amount,
				currency: body.currency,
				date: body.date,
				fees:
					body.fees ??
					(body.feeAmount
						? [{ amount: body.feeAmount, name: body.feeDescription ?? "Taxa", type: "FIXED" }]
						: []),
				targetCurrency: await financialAccountCurrency(
					(body.type === "INCOME"
						? body.destinationFinancialAccountId
						: originFinancialAccountId) ?? body.destinationFinancialAccountId,
					body.bookingCurrency ?? body.currency,
				),
			});
			for (const fee of money.fees)
				if (fee.assetCode && fee.assetCode !== money.bookingCurrency && originFinancialAccountId)
					await financialAccountCurrency(originFinancialAccountId, fee.assetCode);
			const explicitSides =
				(await isPointsAccount(originFinancialAccountId)) ||
				(Boolean(originFinancialAccountId) &&
					(await isPointsAccount(body.destinationFinancialAccountId)));
			const sides = await resolveSides({
				amount: money.amount,
				currency: money.bookingCurrency,
				date: body.date,
				destinationAmount: body.destinationAmount,
				destinationCurrency: body.destinationFinancialAccountId
					? await financialAccountCurrency(
							body.destinationFinancialAccountId,
							body.destinationCurrency,
						)
					: null,
				explicitSides,
				paymentAmount: body.paymentAmount,
				paymentCurrency: body.paymentCreditCardId
					? await creditCardCurrency(body.paymentCreditCardId)
					: null,
			});
			if (isCryptoAsset(money.bookingCurrency) && (body.debtSplit || body.matchDebtEventId))
				throw new HttpException("Dívidas exigem ativo fiat", 400);
			await lockPaymentResources(body.paymentCreditCardId, originFinancialAccountId);
			let transaction = await findExistingOccurrence();
			let wasCreated = false;
			if (!transaction) {
				try {
					transaction = await queryFirst(
						db.sql.public.Transaction.insert([
							{
								amount: numeric<38, 18>(money.amount),
								bookingCurrency: money.bookingCurrency,
								conversionSource: sides.conversionSource,
								currency: money.currency,
								date: body.date,
								description: body.description ?? undefined,
								destinationAmount: nullableNumeric<38, 18>(sides.destinationAmount),
								destinationCurrency: sides.destinationCurrency,
								destinationFinancialAccountId: body.destinationFinancialAccountId,
								exchangeRate: nullableNumeric<38, 18>(money.exchangeRate),
								fees: money.fees.map(fee => ({ ...fee })),
								isHidden: body.isHidden ?? false,
								originalAmount: numeric<38, 18>(money.originalAmount),
								originFinancialAccountId,
								paymentAmount: nullableNumeric<38, 18>(sides.paymentAmount),
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
				if (
					isCryptoAsset(money.bookingCurrency) &&
					(body.debtSplit || inheritedDebtSplit || body.matchDebtEventId)
				)
					throw new HttpException("Dívidas exigem ativo fiat", 400);
				if (!isCryptoAsset(money.bookingCurrency))
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
						description: body.description ?? undefined,
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
							new Date(transaction.date),
							`transaction:${transaction.id}`,
						);
			const tags = tagsByTransaction.get(transaction.id) ?? [];
			return {
				...withDateInstants(transaction),
				amount: String(transaction.amount),
				debtSplit: await getDebtSplitReturn(
					{ transactionId: transaction.id },
					Number(transaction.amount),
				),
				destinationAmount:
					transaction.destinationAmount == null ? null : String(transaction.destinationAmount),
				paymentAmount: transaction.paymentAmount == null ? null : String(transaction.paymentAmount),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: AssetAmountDTO,
				bookingCurrency: t.Optional(AssetCodeDTO),
				currency: t.Optional(AssetCodeDTO),
				date: t.String(),
				debtSplit: t.Optional(DebtSplitInputDTO),
				description: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
				destinationAmount: t.Optional(AssetAmountDTO),
				destinationCurrency: t.Optional(AssetCodeDTO),
				destinationFinancialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				feeAmount: t.Optional(AssetAmountDTO),
				feeDescription: t.Optional(t.String({ maxLength: 100 })),
				fees: t.Optional(t.Array(AssetFeeDTO, { maxItems: 20 })),
				isHidden: t.Optional(t.Boolean()),
				matchDebtEventId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				originFinancialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				paymentAmount: t.Optional(AssetAmountDTO),
				paymentCreditCardId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				recurrenceId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				recurrenceOccurrenceDate: t.Optional(t.String()),
				storeName: t.Optional(t.String({ maxLength: 200 })),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
				time: t.Optional(
					t.Nullable(t.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$" })),
				),
				type: t.Optional(TransactionType),
			}),
			detail: { operationId: "postTransactions", tags: ["Transactions"] },
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
					allowPoints: transactionType !== "INCOME",
				});
			if (destinationFinancialAccountId)
				await assertBalanceAccountOwnership(destinationFinancialAccountId, userId, {
					allowCashback: transactionType === "INCOME",
					allowPoints: transactionType === "INCOME" || transactionType === "TRANSFER",
				});
			if (
				(existing.paymentCreditCardId || body.paymentCreditCardId) &&
				(body.type ?? existing.type) !== "EXPENSE"
			) {
				throw new HttpException("A transação vinculada à fatura deve ser uma saída", 400);
			}
			if (body.paymentCreditCardId) await assertCreditCardOwnership(body.paymentCreditCardId, userId);
			if (body.amount !== undefined && Number(body.amount) <= 0) {
				throw new HttpException("Informe um valor maior que zero", 400);
			}
			if (body.storeName && (body.type ?? existing.type) !== "EXPENSE") {
				throw new HttpException("Loja só pode ser informada em transações de saída", 400);
			}
			if (body.storeName) await resolveStore(userId, body.storeName);

			const moneyChanged =
				body.amount !== undefined ||
				body.currency !== undefined ||
				body.bookingCurrency !== undefined ||
				body.fees !== undefined ||
				body.feeAmount !== undefined ||
				body.date !== undefined ||
				body.originFinancialAccountId !== undefined ||
				body.destinationFinancialAccountId !== undefined ||
				body.type !== undefined;
			const money = moneyChanged
				? await resolveAssetFinancialMoney({
						amount: body.amount ?? String(existing.originalAmount ?? existing.amount),
						currency: body.currency ?? existing.currency,
						date: body.date ?? existing.date,
						fees:
							body.fees ??
							(body.feeAmount !== undefined
								? body.feeAmount
									? [
											{
												amount: body.feeAmount,
												name: body.feeDescription ?? "Taxa",
												type: "FIXED",
											},
										]
									: []
								: (existing.fees as never)),
						targetCurrency: await financialAccountCurrency(
							(transactionType === "INCOME"
								? destinationFinancialAccountId
								: originFinancialAccountId) ?? destinationFinancialAccountId,
							body.bookingCurrency ?? existing.bookingCurrency,
						),
					})
				: undefined;
			if (money && originFinancialAccountId)
				for (const fee of money.fees)
					if (fee.assetCode && fee.assetCode !== money.bookingCurrency)
						await financialAccountCurrency(originFinancialAccountId, fee.assetCode);
			const paymentCreditCardId =
				body.paymentCreditCardId !== undefined
					? body.paymentCreditCardId
					: existing.paymentCreditCardId;
			const sidesChanged =
				moneyChanged ||
				body.destinationAmount !== undefined ||
				body.destinationCurrency !== undefined ||
				body.paymentAmount !== undefined ||
				body.paymentCreditCardId !== undefined;
			const sides = sidesChanged
				? await resolveSides({
						amount: money?.amount ?? String(existing.amount),
						currency: money?.bookingCurrency ?? existing.bookingCurrency,
						date: body.date ?? existing.date,
						destinationAmount:
							body.destinationAmount ??
							(!moneyChanged && body.destinationFinancialAccountId === undefined
								? existing.destinationAmount == null
									? undefined
									: String(existing.destinationAmount)
								: undefined),
						destinationCurrency: destinationFinancialAccountId
							? await financialAccountCurrency(
									destinationFinancialAccountId,
									body.destinationCurrency ?? existing.destinationCurrency ?? undefined,
								)
							: null,
						explicitSides:
							(await isPointsAccount(originFinancialAccountId)) ||
							(Boolean(originFinancialAccountId) &&
								(await isPointsAccount(destinationFinancialAccountId))),
						paymentAmount:
							body.paymentAmount ??
							(!moneyChanged && body.paymentCreditCardId === undefined
								? existing.paymentAmount == null
									? undefined
									: String(existing.paymentAmount)
								: undefined),
						paymentCurrency: paymentCreditCardId
							? await creditCardCurrency(paymentCreditCardId)
							: null,
					})
				: undefined;
			if (
				isCryptoAsset(money?.bookingCurrency ?? existing.bookingCurrency) &&
				(body.debtSplit || body.matchDebtEventId)
			)
				throw new HttpException("Dívidas exigem ativo fiat", 400);
			// Record history for changed fields
			const historyEntries: Array<{
				transactionId: string;
				field: string;
				oldValue: string | null;
				newValue: string | null;
			}> = [];

			if (body.amount !== undefined && body.amount !== String(existing.amount)) {
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
				await executeStatement(db.sql.public.TransactionHistory.insert(historyEntries).build());
			}
			const transaction = await queryFirst(
				db.sql.public.Transaction.update({
					...(sides && {
						conversionSource: sides.conversionSource,
						destinationAmount: nullableNumeric<38, 18>(sides.destinationAmount),
						destinationCurrency: sides.destinationCurrency,
						paymentAmount: nullableNumeric<38, 18>(sides.paymentAmount),
						paymentCurrency: sides.paymentCurrency,
					}),
					...(money && {
						amount: numeric<38, 18>(money.amount),
						bookingCurrency: money.bookingCurrency,
						currency: money.currency,
						exchangeRate: nullableNumeric<38, 18>(money.exchangeRate),
						fees: money.fees.map(fee => ({ ...fee })),
						originalAmount: numeric<38, 18>(money.originalAmount),
					}),
					...(body.date && { date: body.date }),
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
				})
					.where((f, fn) => fn.eq(f.id, params.id))
					.returning(...transactionColumns)
					.build(),
			);
			if (!transaction) throw new HttpException("Transaction not found", 404);
			const changedCards = [
				...new Set(
					[existing.paymentCreditCardId, transaction.paymentCreditCardId].filter(
						(id): id is string => Boolean(id),
					),
				),
			];
			if (changedCards.length) await refreshCardPayments(changedCards);
			if (!isCryptoAsset(transaction.bookingCurrency))
				await syncTransactionDebtEvent({
					amount: Number(transaction.amount),
					date: transaction.date,
					debtSplit: await convertFixedSplitAtDate(
						body.debtSplit,
						new Date(transaction.date),
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
			const recalculationDate =
				new Date(existing.date) < new Date(transaction.date) ? existing.date : transaction.date;
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
					new Date(recalculationDate),
					`transaction:${transaction.id}:${Date.now()}`,
				);

			const tagsByTransaction = await getTagsByEntity(tagEntityType.transaction, [transaction.id]);
			const tags = tagsByTransaction.get(transaction.id) ?? [];
			return {
				...withDateInstants(transaction),
				amount: String(transaction.amount),
				debtSplit: await getDebtSplitReturn(
					{ transactionId: transaction.id },
					Number(transaction.amount),
				),
				destinationAmount:
					transaction.destinationAmount == null ? null : String(transaction.destinationAmount),
				paymentAmount: transaction.paymentAmount == null ? null : String(transaction.paymentAmount),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Optional(AssetAmountDTO),
				bookingCurrency: t.Optional(AssetCodeDTO),
				currency: t.Optional(AssetCodeDTO),
				date: t.Optional(t.String()),
				debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
				description: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
				destinationAmount: t.Optional(AssetAmountDTO),
				destinationCurrency: t.Optional(AssetCodeDTO),
				destinationFinancialAccountId: t.Optional(
					t.Nullable(t.String({ maxLength: 36, minLength: 1 })),
				),
				feeAmount: t.Optional(AssetAmountDTO),
				feeDescription: t.Optional(t.String({ maxLength: 100 })),
				fees: t.Optional(t.Array(AssetFeeDTO, { maxItems: 20 })),
				isHidden: t.Optional(t.Boolean()),
				matchDebtEventId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				originFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				paymentAmount: t.Optional(AssetAmountDTO),
				paymentCreditCardId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				storeName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
				time: t.Optional(
					t.Nullable(t.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$" })),
				),
				type: t.Optional(TransactionType),
			}),
			detail: { operationId: "patchTransactionsById", tags: ["Transactions"] },
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
			for (const accountId of [
				existing.originFinancialAccountId,
				existing.destinationFinancialAccountId,
			])
				if (accountId)
					await enqueueAccountYieldRecalculation(
						accountId,
						new Date(existing.date),
						`transaction-delete:${existing.id}`,
					);
			return { success: true };
		},
		{
			detail: { operationId: "deleteTransactionsById", tags: ["Transactions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	);

async function lockPaymentResources(cardId: string | null | undefined, accountId: string | null | undefined) {
	if (cardId)
		await queryRows(
			db.sql.public.CreditCard.select("id")
				.where((fields, ops) => ops.eq(fields.id, cardId))
				.forUpdate()
				.build(),
		);
	if (accountId)
		await queryRows(
			db.sql.public.FinancialAccount.select("id")
				.where((fields, ops) => ops.eq(fields.id, accountId))
				.forUpdate()
				.build(),
		);
}
