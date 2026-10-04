import {
	addBookRefund,
	type CreditBook,
	ensureBookStatement,
	moneyCents,
	refinanceBookPurchase,
	removeBookRefund,
	replayCreditBook,
	updateBookPurchaseDate,
} from "@zaimu/finance/credit-book";
import { paymentStatement, statementCutoffAfter, statementEntryKind } from "@zaimu/finance/credit-card";
import Elysia, { t } from "elysia";
import { setCardPayer } from "~/modules/accounts/application/payment-preferences";
import { assertBalanceAccountOwnership, assertCreditCardOwnership, requireUserId } from "~/modules/auth";
import {
	type CreditOverviewCard,
	type CreditOverviewRow,
	creditOverviewSql,
	replayOverviewStatements,
} from "~/modules/creditCards/application/credit-overview";
import {
	distributePurchaseCents,
	mutateCreditBook,
	newBookPurchase,
	presentCreditBook,
	readCreditBook,
	resolveBookPurchase,
	transferCreditBookPurchase,
} from "~/modules/creditCards/application/normalized-credit-book";
import {
	createNormalizedRefund,
	deleteNormalizedRefund,
	editNormalizedRefund,
} from "~/modules/creditCards/application/normalized-refunds";
import {
	confirmSuggestedPayment,
	getPaymentSuggestions,
} from "~/modules/creditCards/application/payment-suggestions";
import {
	decodeStatementCursor,
	encodeStatementCursor,
	statementFilterKey,
} from "~/modules/creditCards/application/statement-cursor";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import { getDebtSplitReturn, linkPurchaseToDebt } from "~/modules/debts/application";
import { DebtSplitInputDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";
import { projectRecurringCreditBook } from "~/modules/recurring/application/project-credit-book";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { rejectLegacyFinancialFields } from "~/shared/infra/elysia/strict-json-body";
import {
	db,
	executeStatement,
	queryFirst,
	queryRaw,
	queryRows,
	withRawTransaction,
	withTransaction,
} from "~/shared/infra/sql";
import { CreditBookDTO } from "./CreditBookDTO";
import { CreditCardOverviewReturn, CreditStatementPageReturn } from "./CreditCardReadReturn";
import { CreditPurchaseEditReturn } from "./CreditPurchaseEditReturn";
import {
	ConfirmPaymentSuggestionDTO,
	ConfirmPaymentSuggestionReturn,
	PaymentSuggestionReturn,
} from "./PaymentSuggestionsDTO";

const statementColumns = [
	"id",
	"creditCardId",
	"statementDate",
	"dueDate",
	"totalAmount",
	"paidAmount",
	"isPaid",
	"isFullySynced",
	"createdAt",
	"updatedAt",
] as const;
const toCents = (amount: number | string) => Math.round(Number(amount) * 100);
function resolvePurchaseTime(value?: string | null) {
	return value === undefined ? new Date().toTimeString().slice(0, 5) : value;
}
interface CashbackCard {
	cashbackAccountId: string | null;
	cashbackRate: number | null;
	cashbackYieldPeriod: "MONTHLY" | "YEARLY" | null;
	cashbackYieldReferencePercentage: number | null;
	cashbackYieldReferenceRate: number | null;
}
function rewardSnapshot(card: CashbackCard, total: number) {
	return card.cashbackAccountId && card.cashbackRate
		? {
				cashbackAccountId: card.cashbackAccountId,
				cashbackAmount: Number(((total * card.cashbackRate) / 100).toFixed(4)),
				cashbackYieldPeriod: card.cashbackYieldPeriod,
				cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage,
				cashbackYieldReferenceRate: card.cashbackYieldReferenceRate,
			}
		: {};
}
const RefundPolicyDTO = t.Union([t.Literal("KEEP_INSTALLMENTS"), t.Literal("CANCEL_FUTURE_INSTALLMENTS")]);
const PurchaseFields = {
	debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
	description: t.Optional(t.String({ maxLength: 500 })),
	feeAmount: t.Optional(t.Number({ minimum: 0 })),
	feeDescription: t.Optional(t.String({ maxLength: 100 })),
	installments: t.Optional(t.Integer({ maximum: 48, minimum: 1 })),
	storeName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
	tagIds: t.Optional(t.Array(t.String(), { maxItems: 20 })),
	time: t.Optional(t.Nullable(t.String())),
};
const CreatePurchaseBody = t.Object({
	...PurchaseFields,
	isStatementCharge: t.Optional(t.Boolean()),
	matchDebtEventId: t.Optional(t.String()),
	purchaseDate: t.String({ format: "date" }),
	recurrenceId: t.Optional(t.String()),
	recurrenceOccurrenceDate: t.Optional(t.String({ format: "date" })),
	totalAmount: t.Number({ exclusiveMinimum: 0 }),
});
const UpdatePurchaseBody = t.Object({
	...PurchaseFields,
	creditCardId: t.Optional(t.String()),
	installmentAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
	purchaseDate: t.Optional(t.String({ format: "date" })),
	totalAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
});
export const CreditCardsController = new Elysia({ prefix: "/credit-cards" })
	.get("/payment-suggestions", async ({ request }) => getPaymentSuggestions(await requireUserId(request)), {
		response: t.Array(PaymentSuggestionReturn),
	})
	.put(
		"/:id/payer",
		async ({ params, body, request }) =>
			setCardPayer(
				await requireUserId(request),
				params.id,
				body.paymentAccountId,
				body.paymentSuggestionsEnabled,
			),
		{
			body: t.Object({ paymentAccountId: t.Nullable(t.String()), paymentSuggestionsEnabled: t.Boolean() }),
			response: t.Object({
				paymentAccountId: t.Nullable(t.String()),
				paymentSuggestionsEnabled: t.Boolean(),
			}),
		},
	)
	.post(
		"/:id/payment-suggestions/confirm",
		async ({ params, body, request }) =>
			confirmSuggestedPayment(await requireUserId(request), params.id, body),
		{ body: ConfirmPaymentSuggestionDTO, response: ConfirmPaymentSuggestionReturn },
	)

	.onTransform(({ body }) => {
		rejectLegacyFinancialFields(body);
	})
	.get(
		"/",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(userId, "credit-cards:overview", {}, async () => {
				const cards = await queryRows(
					db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
						functions.eq(fields.CreditCard.financialAccountId, fields.FinancialAccount.id),
					)
						.outerLeftJoin(db.sql.public.FinancialInstitution, (fields, functions) =>
							functions.eq(fields.FinancialAccount.institutionId, fields.FinancialInstitution.id),
						)
						.select((fields, functions) => ({
							accountName:
								functions.raw`COALESCE(${fields.FinancialAccount.name}, ${fields.FinancialInstitution.name}, 'Cartão de crédito')`.returns(
									"sql/varchar@1",
								),
							cashbackAccountId: fields.CreditCard.cashbackAccountId,
							cashbackRate: fields.CreditCard.cashbackRate,
							cashbackYieldPeriod: fields.CreditCard.cashbackYieldPeriod,
							cashbackYieldReferencePercentage: fields.CreditCard.cashbackYieldReferencePercentage,
							cashbackYieldReferenceRate: fields.CreditCard.cashbackYieldReferenceRate,
							createdAt: fields.CreditCard.createdAt,
							creditLimit: fields.CreditCard.creditLimit,
							dueDay: fields.CreditCard.dueDay,
							excludeFromTotals: fields.CreditCard.excludeFromTotals,
							financialAccountId: fields.CreditCard.financialAccountId,
							id: fields.CreditCard.id,
							ignoreStatementsBefore: fields.CreditCard.ignoreStatementsBefore,
							paymentAccountId: fields.CreditCard.paymentAccountId,
							paymentSuggestionsEnabled: fields.CreditCard.paymentSuggestionsEnabled,
							securityDeposit: fields.CreditCard.securityDeposit,
							statementDay: fields.CreditCard.statementDay,
							workingDueDate: fields.CreditCard.workingDueDate,
						}))
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.FinancialAccount.userId, userId),
								functions.eq(fields.FinancialAccount.isHidden, false),
							),
						)
						.orderBy(fields => fields.FinancialAccount.name, { direction: "asc" })
						.build(),
				);
				if (cards.length === 0) return [];
				const reviewCounts = await queryRaw<{ creditCardId: string; count: number }>(
					`SELECT review."creditCardId", count(*)::int AS count FROM "CreditRefundReview" review JOIN "CreditEntryReference" ref ON ref."id"=review."id" WHERE review."userId"=$1 AND review."approvedAt" IS NULL AND ref."requiresRefundReview" GROUP BY review."creditCardId"`,
					[userId],
				);
				const countsByCard = new Map(reviewCounts.map(row => [row.creditCardId, row.count]));
				const rows = await queryRaw<CreditOverviewRow>(creditOverviewSql, [userId]);
				const replayCards = rows
					.filter(row => row.kind === "card")
					.map(row => row.data) as unknown as CreditOverviewCard[];
				const statements = replayOverviewStatements(
					userId,
					replayCards,
					rows,
					new Date().toISOString().slice(0, 10),
				);
				const byCard = new Map<string, typeof statements>();
				for (const statement of statements) {
					const items = byCard.get(statement.creditCardId) ?? [];
					items.push(statement);
					byCard.set(statement.creditCardId, items);
				}
				return cards.map(card => {
					const effectiveStatements = byCard.get(card.id) ?? [];
					const currentStatement = paymentStatement(effectiveStatements, new Date()) ?? null;
					const netUsedInCents = effectiveStatements.reduce(
						(total, statement) => total + toCents(statement.balanceAmount),
						0,
					);
					const temporaryCreditInCents = Math.max(0, -netUsedInCents);
					const usedLimitInCents = Math.max(0, netUsedInCents);
					const effectiveLimitInCents = toCents(card.creditLimit) + temporaryCreditInCents;
					return {
						...card,
						currentStatement,
						limit: {
							availableLimit: Math.max(0, effectiveLimitInCents - usedLimitInCents) / 100,
							effectiveLimit: effectiveLimitInCents / 100,
							temporaryCredit: temporaryCreditInCents / 100,
							usedLimit: usedLimitInCents / 100,
						},
						pendingRefundReviewCount: countsByCard.get(card.id) ?? 0,
					};
				});
			});
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return null;
			}
			return cached.value;
		},
		{
			detail: { tags: ["Credit Cards"] },
			response: { 200: t.Array(CreditCardOverviewReturn), 304: t.Null() },
		},
	)
	.get(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertCreditCardOwnership(params.id, userId);
			const card = await queryFirst(
				db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
					functions.eq(fields.CreditCard.financialAccountId, fields.FinancialAccount.id),
				)
					.outerLeftJoin(db.sql.public.FinancialInstitution, (fields, functions) =>
						functions.eq(fields.FinancialAccount.institutionId, fields.FinancialInstitution.id),
					)
					.select((fields, functions) => ({
						accountName:
							functions.raw`COALESCE(${fields.FinancialAccount.name}, ${fields.FinancialInstitution.name}, 'Cartão de crédito')`.returns(
								"sql/varchar@1",
							),
						cashbackAccountId: fields.CreditCard.cashbackAccountId,
						cashbackRate: fields.CreditCard.cashbackRate,
						cashbackYieldPeriod: fields.CreditCard.cashbackYieldPeriod,
						cashbackYieldReferencePercentage: fields.CreditCard.cashbackYieldReferencePercentage,
						cashbackYieldReferenceRate: fields.CreditCard.cashbackYieldReferenceRate,
						createdAt: fields.CreditCard.createdAt,
						creditLimit: fields.CreditCard.creditLimit,
						dueDay: fields.CreditCard.dueDay,
						excludeFromTotals: fields.CreditCard.excludeFromTotals,
						financialAccountId: fields.CreditCard.financialAccountId,
						id: fields.CreditCard.id,
						ignoreStatementsBefore: fields.CreditCard.ignoreStatementsBefore,
						paymentAccountId: fields.CreditCard.paymentAccountId,
						paymentSuggestionsEnabled: fields.CreditCard.paymentSuggestionsEnabled,
						securityDeposit: fields.CreditCard.securityDeposit,
						statementDay: fields.CreditCard.statementDay,
						workingDueDate: fields.CreditCard.workingDueDate,
					}))
					.where((fields, functions) => functions.eq(fields.CreditCard.id, params.id))
					.limit(1)
					.build(),
			);

			if (!card) {
				throw new HttpException("Credit card not found", 404);
			}

			return card;
		},
		{
			detail: { tags: ["Credit Cards"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.patch(
		"/:id/statement-cutoff",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			await assertCreditCardOwnership(params.id, userId);
			if (body.statementDate) {
				const statement = await queryFirst(
					db.sql.public.CreditCardStatement.select("id")
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.creditCardId, params.id),
								functions.eq(fields.statementDate, new Date(`${body.statementDate}T12:00:00Z`)),
							),
						)
						.limit(1)
						.build(),
				);
				if (!statement) throw new HttpException("Fatura não encontrada", 404);
			}
			const cutoff = body.statementDate ? statementCutoffAfter(body.statementDate) : null;
			await executeStatement(
				db.sql.public.CreditCard.update({
					ignoreStatementsBefore: cutoff ? new Date(`${cutoff}T12:00:00Z`) : null,
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { ignoreStatementsBefore: cutoff };
		},
		{
			body: t.Object({
				statementDate: t.Nullable(t.String({ pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$" })),
			}),
			params: t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) }),
		},
	)
	.get("/:id/refund-reviews", async ({ params, request }) => {
		const userId = await requireUserId(request);
		return queryRaw<{ id: string; original: Record<string, unknown> }>(
			`SELECT r."id", archive."original" FROM "CreditEntryReference" r JOIN "CreditRefundReview" archive ON archive."id"=r."id" WHERE r."requiresRefundReview" AND archive."approvedAt" IS NULL AND archive."creditCardId"=$1 AND archive."userId"=$2 ORDER BY archive."createdAt"`,
			[params.id, userId],
		);
	})
	.post(
		"/:id/refund-reviews/:reviewId/approve",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			return withRawTransaction(async query => {
				const [review] = await query<{
					id: string;
					original: {
						purchaseDate: string;
						totalAmount: number;
						time: string | null;
						externalId: string | null;
					};
				}>(
					`SELECT r."id", archive."original" FROM "CreditEntryReference" r JOIN "CreditRefundReview" archive ON archive."id"=r."id" WHERE r."id"=$1 AND r."requiresRefundReview" AND archive."approvedAt" IS NULL AND archive."creditCardId"=$2 AND archive."userId"=$3 FOR UPDATE OF r`,
					[params.reviewId, params.id, userId],
				);
				if (!review) throw new HttpException("Reembolso pendente não encontrado", 404);
				if (Boolean(body.purchaseId) === Boolean(body.purchase))
					throw new HttpException("Vincule ou reconstrua a compra original", 400);
				const amount = Math.abs(Number(review.original.totalAmount));
				if (!Number.isFinite(amount) || amount <= 0)
					throw new HttpException("Valor original do reembolso inválido", 400);
				let purchaseId = "";
				await mutateCreditBook(userId, params.id, book => {
					const purchase = body.purchaseId
						? book.purchases.find(p => p.id === body.purchaseId)
						: body.purchase
							? newBookPurchase(book, {
									...body.purchase,
									storeName: body.purchase.storeName ?? null,
									tagIds: body.purchase.tagIds ?? [],
								})
							: null;
					if (!purchase) throw new HttpException("Compra original não encontrada", 404);
					purchaseId = purchase.id;
					const refund = addBookRefund(book, purchase.id, {
						amount,
						creditDate: String(review.original.purchaseDate).slice(0, 10),
						id: review.id,
						policy: body.policy,
					});
					refund.time = review.original.time ?? null;
					refund.externalId = review.original.externalId ?? null;
				});
				await query(
					'UPDATE "CreditRefundReview" SET "approvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "userId"=$2',
					[review.id, userId],
				);
				return { id: review.id, purchaseId };
			});
		},
		{
			body: t.Object({
				policy: t.Optional(RefundPolicyDTO),
				purchase: t.Optional(
					t.Object({
						description: t.String({ maxLength: 500, minLength: 1 }),
						installments: t.Integer({ maximum: 48, minimum: 1 }),
						purchaseDate: t.String({ format: "date" }),
						storeName: t.Optional(t.String()),
						tagIds: t.Optional(t.Array(t.String())),
						totalAmount: t.Number({ exclusiveMinimum: 0 }),
					}),
				),
				purchaseId: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/:id/purchases/:purchaseId",
		async ({ params, request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"credit-cards:overview",
				{ domain: "purchase-edit", ...params },
				async () => {
					const rows = await queryRaw<{
						id: string;
						totalAmount: number;
						purchaseDate: Date;
						externalId: string | null;
						feeAmount: number | null;
						installmentImportedNumbers: number[];
					}>(
						`
				SELECT p."id", p."totalAmount", p."purchaseDate", p."externalId", p."feeAmount",
				COALESCE((SELECT jsonb_agg(plan."number" ORDER BY plan."number") FROM "CreditInstallmentPlan" plan WHERE plan."purchaseId"=p."id" AND plan."hasImportedAmount"), '[]'::jsonb) AS "installmentImportedNumbers"
				FROM "CreditPurchaseRecord" p WHERE p."id"=$1 AND p."creditCardId"=$2 AND p."userId"=$3`,
						[params.purchaseId, params.id, userId],
					);
					const row = rows[0];
					if (!row) throw new HttpException("Compra não encontrada", 404);
					return {
						debtSplit: await getDebtSplitReturn({ creditPurchaseId: row.id }, Number(row.totalAmount)),
						externalId: row.externalId,
						feeAmount: row.feeAmount,
						id: row.id,
						installmentImportedNumbers: row.installmentImportedNumbers,
						purchaseDate: row.purchaseDate.toISOString().slice(0, 10),
						totalAmountCents: moneyCents(Number(row.totalAmount), 1),
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
		{ response: t.Union([CreditPurchaseEditReturn, t.Null()]) },
	)
	.get(
		"/:id/book",
		async ({ params, request }) => {
			const book = await readCreditBook(await requireUserId(request), params.id);
			const response: CreditBookDTO = {
				...book,
				purchases: book.purchases.map(p => ({
					...p,
					installmentAmountsCents: [...p.installmentAmountsCents],
					tagIds: [...p.tagIds],
				})),
			};
			return response;
		},
		{ response: CreditBookDTO },
	)
	.get(
		"/:id/statements",
		async ({ params, request, query, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				`credit-cards:${params.id}:statements`,
				{ kind: "page", ...query },
				async () => {
					const book = await projectRecurringCreditBook(await readCreditBook(userId, params.id, false));
					const cursor = query.cursor ? decodeStatementCursor(query.cursor, query.isPaid) : null;
					const rows = replayCreditBook(book)
						.statements.filter(s => query.isPaid === undefined || s.isPaid === query.isPaid)
						.toSorted((a, b) => b.statementDate.localeCompare(a.statementDate) || b.id.localeCompare(a.id))
						.filter(
							s =>
								!cursor ||
								s.statementDate < cursor.statementDate.slice(0, 10) ||
								(s.statementDate === cursor.statementDate.slice(0, 10) && s.id < cursor.id),
						);
					const limit = query.limit ?? 24;
					const items = rows.slice(0, limit);
					const last = items.at(-1);
					const hasMore = rows.length > limit;
					return {
						hasMore,
						items,
						nextCursor:
							hasMore && last
								? encodeStatementCursor({
										filter: statementFilterKey(query.isPaid),
										id: last.id,
										statementDate: last.statementDate,
									})
								: null,
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
			query: t.Object({
				cursor: t.Optional(t.String()),
				isPaid: t.Optional(t.Boolean()),
				limit: t.Optional(t.Number({ maximum: 100, minimum: 1 })),
			}),
			response: { 200: CreditStatementPageReturn, 304: t.Null() },
		},
	)
	.get("/:id/statements/:statementId", async ({ params, request, set }) => {
		const userId = await requireUserId(request);
		const cached = await distributedCache.remember(
			userId,
			`credit-cards:${params.id}:statements`,
			{ kind: "detail", statementId: params.statementId },
			async () => {
				const book = await projectRecurringCreditBook(await readCreditBook(userId, params.id, false));
				const statements = replayCreditBook(book).statements;
				const statement = statements.find(s => s.id === params.statementId);
				if (!statement) throw new HttpException("Fatura não encontrada", 404);
				const paymentIds = book.payments
					.filter(payment => paymentStatement(statements, new Date(payment.date))?.id === statement.id)
					.map(payment => payment.id);
				const paymentRows = paymentIds.length
					? await queryRaw<{
							id: string;
							amount: number;
							date: Date;
							time: string | null;
							description: string | null;
						}>(
							`SELECT "id","amount","date","time","description" FROM "Transaction" WHERE "paymentCreditCardId"=$1 AND "userId"=$2 AND "id"=ANY($3::varchar[])`,
							[params.id, book.card.userId, paymentIds],
						)
					: [];
				return {
					...statement,
					payments: paymentRows
						.filter(p => paymentStatement(statements, p.date)?.id === statement.id)
						.map(p => ({ ...p, amount: Number(p.amount), paymentCreditCardId: params.id, type: "EXPENSE" })),
					purchases: await presentCreditBook(book, statement.id),
					totalAmount: Number(statement.totalAmount) + statement.chargesAmount,
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
	})
	.post(
		"/:id/purchases",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			const createdId = await withRawTransaction(async () => {
				if (body.matchDebtEventId && body.debtSplit)
					throw new HttpException("Rateio e conciliação não podem ser usados juntos", 400);
				const id = await mutateCreditBook(userId, params.id, async (book, query) => {
					if (statementEntryKind(body.description ?? "") === "BALANCE")
						throw new HttpException("Saldo anterior é calculado automaticamente", 400);
					if (body.isStatementCharge) {
						if (body.debtSplit || (body.installments ?? 1) !== 1)
							throw new HttpException("Encargos não permitem rateio ou parcelamento", 400);
						const s = ensureBookStatement(book, body.purchaseDate);
						book.charges.push({
							amountCents: moneyCents(body.totalAmount, 1),
							chargeDate: body.purchaseDate,
							description: body.description ?? "Encargo",
							externalId: null,
							id: crypto.randomUUID(),
							isSettled: false,
							settledByPurchaseId: null,
							statementId: s.id,
							time: resolvePurchaseTime(body.time),
						});
						return book.charges.at(-1)!.id;
					}
					const existing = body.recurrenceId
						? book.purchases.find(
								p =>
									p.recurrenceId === body.recurrenceId &&
									p.recurrenceOccurrenceDate === body.recurrenceOccurrenceDate,
							)
						: null;
					if (existing) return existing.id;
					const [card] = await query<CashbackCard>(
						`SELECT "cashbackAccountId","cashbackRate","cashbackYieldPeriod","cashbackYieldReferencePercentage","cashbackYieldReferenceRate" FROM "CreditCard" WHERE "id"=$1`,
						[params.id],
					);
					return newBookPurchase(book, {
						...body,
						debtSplitRule: body.debtSplit ?? null,
						description: body.description ?? "",
						installments: body.installments ?? 1,
						storeName: body.storeName ?? null,
						tagIds: body.tagIds ?? [],
						time: resolvePurchaseTime(body.time),
						...rewardSnapshot(card!, body.totalAmount),
					}).id;
				});
				if (body.matchDebtEventId)
					await linkPurchaseToDebt({
						creditPurchaseId: id,
						date: body.purchaseDate,
						description: body.description,
						matchEventId: body.matchDebtEventId,
						totalAmount: body.totalAmount,
						userId,
					});
				return id;
			});
			return (await presentCreditBook(await readCreditBook(userId, params.id))).filter(
				row => row.purchaseId === createdId || row.id === createdId,
			);
		},
		{ body: CreatePurchaseBody },
	)
	.post(
		"/:id/purchases/:purchaseId/refunds",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			const refund = await createNormalizedRefund(
				{ cardId: params.id, purchaseId: params.purchaseId, userId },
				{ amount: body.amount, creditDate: body.purchaseDate, policy: body.policy },
			);
			return (await presentCreditBook(await readCreditBook(userId, params.id))).find(
				row => row.id === refund.id,
			);
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				policy: t.Optional(RefundPolicyDTO),
				purchaseDate: t.String({ format: "date" }),
			}),
		},
	)
	.patch(
		"/:id/purchases/:purchaseId/refunds/:refundId",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			await editNormalizedRefund(
				{ cardId: params.id, purchaseId: params.purchaseId, userId },
				params.refundId,
				{ amount: body.amount, creditDate: body.purchaseDate },
			);
			return (await presentCreditBook(await readCreditBook(userId, params.id))).find(
				row => row.id === params.refundId,
			);
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				purchaseDate: t.Optional(t.String({ format: "date" })),
			}),
		},
	)
	.delete("/:id/purchases/:purchaseId/refunds/:refundId", async ({ params, request }) => {
		await deleteNormalizedRefund(
			{ cardId: params.id, purchaseId: params.purchaseId, userId: await requireUserId(request) },
			params.refundId,
		);
		return { success: true };
	})
	.patch(
		"/:id/purchases/:purchaseId",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			const destinationCardId = body.creditCardId ?? params.id;
			const update = (book: CreditBook) => {
				const p = resolveBookPurchase(book, params.purchaseId);
				if (body.installmentAmount !== undefined) {
					const i = book.installments.find(row => row.id === params.purchaseId);
					if (!i) throw new HttpException("Parcela não encontrada", 404);
					const amounts = [...p.installmentAmountsCents];
					amounts[i.number - 1] = moneyCents(body.installmentAmount, 1);
					p.installmentAmountsCents = amounts;
					p.totalAmountCents = amounts.reduce((a, b) => a + b, 0);
					i.amountCents = amounts[i.number - 1]!;
				} else {
					const count = body.installments ?? p.installmentAmountsCents.length;
					if (book.installments.some(i => i.purchaseId === p.id && i.number > count))
						throw new HttpException("Parcelas históricas não podem ser removidas", 409);
					if (body.totalAmount !== undefined || body.installments !== undefined) {
						const total = moneyCents(body.totalAmount ?? p.totalAmountCents / 100, 1);
						const known = new Map(
							book.installments
								.filter(i => i.purchaseId === p.id && i.hasImportedAmount)
								.map(i => [i.number, i.amountCents]),
						);
						p.installmentAmountsCents = distributePurchaseCents(total, count, known);
						p.totalAmountCents = total;
						for (const i of book.installments.filter(i => i.purchaseId === p.id))
							i.amountCents = p.installmentAmountsCents[i.number - 1]!;
					}
				}
				if (body.description !== undefined) p.description = body.description;
				if (body.storeName !== undefined) p.storeName = body.storeName;
				if (body.time !== undefined) p.time = body.time;
				if (body.tagIds !== undefined) p.tagIds = body.tagIds;
				if (body.debtSplit !== undefined) p.debtSplitRule = body.debtSplit;
				if (body.purchaseDate !== undefined) updateBookPurchaseDate(book, p.id, body.purchaseDate);
				if (body.feeAmount !== undefined) {
					p.feeAmount = body.feeAmount || null;
					p.feeDescription = body.feeAmount ? (body.feeDescription ?? p.feeDescription) : null;
				}
				p.updatedAt = new Date().toISOString();
			};
			if (destinationCardId === params.id) await mutateCreditBook(userId, params.id, update);
			else
				await transferCreditBookPurchase(
					userId,
					params.id,
					destinationCardId,
					params.purchaseId,
					async (book, query) => {
						update(book);
						const [card] = await query<CashbackCard>(
							`SELECT "cashbackAccountId","cashbackRate","cashbackYieldPeriod","cashbackYieldReferencePercentage","cashbackYieldReferenceRate" FROM "CreditCard" WHERE "id"=$1`,
							[destinationCardId],
						);
						const purchase = resolveBookPurchase(book, params.purchaseId);
						Object.assign(
							purchase,
							{
								cashbackAccountId: null,
								cashbackAmount: null,
								cashbackYieldPeriod: null,
								cashbackYieldReferencePercentage: null,
								cashbackYieldReferenceRate: null,
							},
							rewardSnapshot(card!, purchase.totalAmountCents / 100),
						);
					},
				);
			return (await presentCreditBook(await readCreditBook(userId, destinationCardId))).find(
				row => row.id === params.purchaseId || row.purchaseId === params.purchaseId,
			);
		},
		{ body: UpdatePurchaseBody },
	)
	.delete("/:id/purchases/:purchaseId", async ({ params, request }) => {
		await mutateCreditBook(await requireUserId(request), params.id, book => {
			const refund = book.refunds.find(r => r.id === params.purchaseId);
			if (refund) {
				removeBookRefund(book, refund.purchaseId, refund.id);
				return;
			}
			const charge = book.charges.find(ch => ch.id === params.purchaseId);
			if (charge) {
				book.charges = book.charges.filter(ch => ch.id !== charge.id);
				return;
			}
			const p = resolveBookPurchase(book, params.purchaseId);
			book.purchases = book.purchases.filter(row => row.id !== p.id);
			book.installments = book.installments.filter(i => i.purchaseId !== p.id);
			book.refunds = book.refunds.filter(r => r.purchaseId !== p.id);
		});
		return { success: true };
	})
	.post(
		"/:id/purchases/:purchaseId/refinance",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			let settledAmount = 0;
			let totalAmount = 0;
			await mutateCreditBook(userId, params.id, book => {
				const result = refinanceBookPurchase(book, resolveBookPurchase(book, params.purchaseId).id, body);
				settledAmount = result.settledAmount;
				totalAmount = result.totalAmount;
			});
			return {
				purchases: await presentCreditBook(await readCreditBook(userId, params.id)),
				settledAmount,
				totalAmount,
			};
		},
		{
			body: t.Object({
				feeAmount: t.Number({ minimum: 0 }),
				installments: t.Integer({ maximum: 48, minimum: 1 }),
				purchaseDate: t.String({ format: "date" }),
			}),
		},
	)
	.post(
		"/:id/payments",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			await assertCreditCardOwnership(params.id, userId);
			await assertBalanceAccountOwnership(body.financialAccountId, userId);
			const transaction = await withTransaction(async executor => {
				await queryRaw(`SELECT "id" FROM "CreditCard" WHERE "id"=$1 FOR UPDATE`, [params.id]);
				await queryRaw(`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 FOR UPDATE`, [
					body.financialAccountId,
				]);
				const payment = await executor.queryFirst(
					executor.db.sql.public.Transaction.insert([
						{
							amount: String(body.amount),
							date: new Date(body.date),
							originFinancialAccountId: body.financialAccountId,
							paymentCreditCardId: params.id,
							time: resolvePurchaseTime(body.time),
							type: "EXPENSE",
							userId,
						},
					])
						.returning(
							"id",
							"amount",
							"paymentCreditCardId",
							"date",
							"description",
							"type",
							"originFinancialAccountId",
							"time",
							"createdAt",
						)
						.build(),
				);
				if (!payment) throw new HttpException("Pagamento não criado", 500);
				await recalculateStatementPayments(executor, [params.id]);
				return payment;
			});
			return { transaction };
		},
		{
			body: t.Object({
				amount: t.Number({ exclusiveMinimum: 0 }),
				date: t.String({ format: "date" }),
				financialAccountId: t.String({ maxLength: 36, minLength: 1 }),
				time: t.Optional(t.Nullable(t.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$" }))),
			}),
			detail: { tags: ["Credit Cards"] },
			params: t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) }),
		},
	)
	.get(
		"/:id/history",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertCreditCardOwnership(params.id, userId);
			const history = await queryRows(
				db.sql.public.CreditCardHistory.select(
					"id",
					"creditCardId",
					"field",
					"oldValue",
					"newValue",
					"changedAt",
				)
					.where((fields, functions) => functions.eq(fields.creditCardId, params.id))
					.orderBy("changedAt", { direction: "desc" })
					.build(),
			);

			return history;
		},
		{
			detail: { tags: ["Credit Cards"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	);
