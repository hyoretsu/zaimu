import { getMonetaryBalancesAtDates } from "~/modules/accounts/application/get-monetary-balances-at-dates";
import { getTagsByEntity, tagEntityType } from "~/modules/categories/application/tag-assignments";
import { getCreditPurchaseSyncStatus } from "~/modules/creditCards/domain/credit-purchase-sync-status";
import { HttpException } from "~/shared/errors";
import { db, queryRaw, queryRows } from "~/shared/infra/sql";

interface ListTransactionsPageInput {
	categoryId?: string;
	cursor?: string;
	endDate?: string;
	financialAccountId?: string;
	limit?: number;
	search?: string;
	source?: "CREDIT_CARD" | "FINANCIAL_ACCOUNT";
	startDate?: string;
	type?: "EXPENSE" | "INCOME" | "TRANSFER";
	visibility?: "hidden" | "visible";
}

export interface TransactionCursorPayload {
	createdAt: string;
	date: string;
	filterHash: string;
	id: string;
	sourceRank: number;
}

interface TransactionSummaryRow {
	[key: string]: unknown;
	amount: number;
	categoryColor: null | string;
	categoryId: null | string;
	categoryName: null | string;
	createdAt: Date;
	creditCardId: null | string;
	creditCardName: null | string;
	creditCardStatementDate: Date | null;
	creditCardStatementId: null | string;
	currentInstallment: number | null;
	date: Date;
	description: null | string;
	destinationAccountRewardsKind: null | string;
	destinationAccountType: null | string;
	destinationFinancialAccountId: null | string;
	destinationName: null | string;
	feeAmount: null | number;
	feeDescription: null | string;
	hasRefund: boolean;
	id: string;
	installmentAmount: null | number;
	installments: number | null;
	isHidden: boolean;
	isRefund: boolean;
	originAccountRewardsKind: null | string;
	originAccountType: null | string;
	originFinancialAccountId: null | string;
	originName: null | string;
	parentId: null | string;
	recurrenceId: null | string;
	recurrenceOccurrenceDate: Date | null;
	refundOfPurchaseId: null | string;
	salaryId: null | string;
	salaryOccurrenceDate: Date | null;
	source: "CREDIT_CARD" | "FINANCIAL_ACCOUNT";
	sourceName: null | string;
	sourceRank: number;
	statementId: null | string;
	storeName: null | string;
	subscriptionId: null | string;
	subscriptionOccurrenceDate: Date | null;
	time: null | string;
	type: "EXPENSE" | "INCOME" | "TRANSFER";
}

export const transactionPageFilterHash = (input: ListTransactionsPageInput) =>
	new Bun.CryptoHasher("sha256")
		.update(
			JSON.stringify({
				categoryId: input.categoryId ?? null,
				endDate: input.endDate ?? null,
				financialAccountId: input.financialAccountId ?? null,
				search: input.search?.trim() ?? null,
				source: input.source ?? null,
				startDate: input.startDate ?? null,
				type: input.type ?? null,
				visibility: input.visibility ?? null,
			}),
		)
		.digest("hex");

export const encodeTransactionCursor = (cursor: TransactionCursorPayload) =>
	Buffer.from(JSON.stringify(cursor)).toString("base64url");

export const decodeTransactionCursor = (
	cursor: string | undefined,
	expectedFilterHash: string,
): TransactionCursorPayload | null => {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as TransactionCursorPayload;
		if (
			!parsed.id ||
			!parsed.date ||
			!parsed.createdAt ||
			!Number.isInteger(parsed.sourceRank) ||
			parsed.filterHash !== expectedFilterHash ||
			Number.isNaN(Date.parse(parsed.date)) ||
			Number.isNaN(Date.parse(parsed.createdAt))
		)
			throw new Error("invalid cursor");
		return parsed;
	} catch {
		throw new HttpException("Cursor inválido para estes filtros", 400);
	}
};

const listSql = `
WITH combined AS (
  SELECT
    t."id", t."amount"::numeric AS "amount", t."date", t."time"::text AS "time",
    t."description", t."storeName", t."isHidden", t."type"::text AS "type", t."categoryId",
    category."name" AS "categoryName", category."color" AS "categoryColor", t."createdAt",
    t."originFinancialAccountId", t."destinationFinancialAccountId",
    origin."type"::text AS "originAccountType", destination."type"::text AS "destinationAccountType",
    origin_rewards."kind"::text AS "originAccountRewardsKind",
    destination_rewards."kind"::text AS "destinationAccountRewardsKind",
    COALESCE(origin."name", origin_institution."name") AS "originName",
    COALESCE(destination."name", destination_institution."name") AS "destinationName",
    t."recurrenceId", t."recurrenceOccurrenceDate", t."salaryId", t."salaryOccurrenceDate",
    t."subscriptionId", t."subscriptionOccurrenceDate", t."creditCardStatementId",
    payment_statement."statementDate" AS "creditCardStatementDate",
    payment_card."id" AS "creditCardId",
    COALESCE(payment_account."name", payment_institution."name") AS "creditCardName",
    CASE WHEN t."type" <> 'TRANSFER'
      AND COALESCE(destination."type", origin."type") = 'CREDIT_CARD'
      AND t."recurrenceId" IS NULL AND t."salaryId" IS NULL AND t."subscriptionId" IS NULL
      THEN 'CREDIT_CARD' ELSE 'FINANCIAL_ACCOUNT' END AS "source",
    CASE WHEN t."type" = 'INCOME' THEN COALESCE(destination."name", destination_institution."name")
      ELSE COALESCE(origin."name", origin_institution."name") END AS "sourceName",
    NULL::numeric AS "feeAmount", NULL::text AS "feeDescription", NULL::boolean AS "isRefund",
    NULL::boolean AS "hasRefund", NULL::text AS "refundOfPurchaseId", NULL::smallint AS "currentInstallment",
    NULL::smallint AS "installments", NULL::numeric AS "installmentAmount", NULL::text AS "parentId",
    NULL::text AS "statementId", 0 AS "sourceRank",
    concat_ws(' ', t."amount"::text, to_char(t."date", 'DD/MM/YYYY'), t."description", t."storeName",
      category."name", origin."name", origin_institution."name", destination."name", destination_institution."name",
      (SELECT string_agg(tag."name", ' ') FROM "TagAssignment" assignment
       JOIN "Category" tag ON tag."id" = assignment."categoryId"
       WHERE assignment."entityType" = 'TRANSACTION' AND assignment."entityId" = t."id")) AS search_text
  FROM "Transaction" t
  LEFT JOIN "Category" category ON category."id" = t."categoryId"
  LEFT JOIN "FinancialAccount" origin ON origin."id" = t."originFinancialAccountId"
  LEFT JOIN "FinancialInstitution" origin_institution ON origin_institution."id" = origin."institutionId"
  LEFT JOIN "RewardsAccount" origin_rewards ON origin_rewards."financialAccountId" = origin."id"
  LEFT JOIN "FinancialAccount" destination ON destination."id" = t."destinationFinancialAccountId"
  LEFT JOIN "FinancialInstitution" destination_institution ON destination_institution."id" = destination."institutionId"
  LEFT JOIN "RewardsAccount" destination_rewards ON destination_rewards."financialAccountId" = destination."id"
  LEFT JOIN "CreditCardStatement" payment_statement ON payment_statement."id" = t."creditCardStatementId"
  LEFT JOIN "CreditCard" payment_card ON payment_card."id" = payment_statement."creditCardId"
  LEFT JOIN "FinancialAccount" payment_account ON payment_account."id" = payment_card."financialAccountId"
  LEFT JOIN "FinancialInstitution" payment_institution ON payment_institution."id" = payment_account."institutionId"
  WHERE t."userId" = $1

  UNION ALL

  SELECT
    purchase."id", abs(purchase."totalAmount")::numeric AS "amount", purchase."purchaseDate" AS "date",
    purchase."time"::text AS "time", purchase."description", purchase."storeName", false AS "isHidden",
    CASE WHEN purchase."isRefund" THEN 'INCOME' ELSE 'EXPENSE' END AS "type", purchase."categoryId",
    category."name" AS "categoryName", category."color" AS "categoryColor", purchase."createdAt",
    account."id" AS "originFinancialAccountId", NULL::text AS "destinationFinancialAccountId",
    'CREDIT_CARD' AS "originAccountType", NULL::text AS "destinationAccountType",
    NULL::text AS "originAccountRewardsKind", NULL::text AS "destinationAccountRewardsKind",
    COALESCE(account."name", institution."name", 'Cartão de crédito') AS "originName",
    NULL::text AS "destinationName", NULL::text AS "recurrenceId", NULL::date AS "recurrenceOccurrenceDate",
    NULL::text AS "salaryId", NULL::date AS "salaryOccurrenceDate", purchase."subscriptionId",
    purchase."subscriptionOccurrenceDate", purchase."statementId" AS "creditCardStatementId",
    statement."statementDate" AS "creditCardStatementDate", card."id" AS "creditCardId",
    COALESCE(account."name", institution."name", 'Cartão de crédito') AS "creditCardName",
    'CREDIT_CARD' AS "source", COALESCE(account."name", institution."name", 'Cartão de crédito') AS "sourceName",
    purchase."feeAmount", purchase."feeDescription", purchase."isRefund",
    EXISTS (SELECT 1 FROM "CreditPurchase" refund WHERE refund."refundOfPurchaseId" = purchase."id") AS "hasRefund",
    purchase."refundOfPurchaseId", purchase."currentInstallment", purchase."installments",
    purchase."installmentAmount", purchase."parentId", purchase."statementId", 1 AS "sourceRank",
    concat_ws(' ', purchase."totalAmount"::text, to_char(purchase."purchaseDate", 'DD/MM/YYYY'),
      purchase."description", purchase."storeName", category."name", account."name", institution."name",
      (SELECT string_agg(tag."name", ' ') FROM "TagAssignment" assignment
       JOIN "Category" tag ON tag."id" = assignment."categoryId"
       WHERE assignment."entityType" = 'CREDIT_PURCHASE' AND assignment."entityId" = purchase."id")) AS search_text
  FROM "CreditPurchase" purchase
  JOIN "CreditCardStatement" statement ON statement."id" = purchase."statementId"
  JOIN "CreditCard" card ON card."id" = statement."creditCardId"
  JOIN "FinancialAccount" account ON account."id" = card."financialAccountId"
  LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
  LEFT JOIN "Category" category ON category."id" = purchase."categoryId"
  WHERE purchase."userId" = $1 AND purchase."currentInstallment" = 1
)
SELECT * FROM combined
WHERE ($2::date IS NULL OR "date" >= $2::date)
  AND ($3::date IS NULL OR "date" <= $3::date)
  AND ($4::text IS NULL OR "type" = $4::text)
  AND ($5::text IS NULL OR "categoryId" = $5::text OR EXISTS (
    SELECT 1 FROM "TagAssignment" assignment
    WHERE assignment."entityId" = combined."id" AND assignment."categoryId" = $5::text
      AND assignment."entityType" = CASE WHEN combined."sourceRank" = 0 THEN 'TRANSACTION' ELSE 'CREDIT_PURCHASE' END
  ))
  AND ($6::text IS NULL OR "originFinancialAccountId" = $6::text OR "destinationFinancialAccountId" = $6::text)
  AND ($7::text IS NULL OR ($7::text = 'hidden' AND "isHidden") OR ($7::text = 'visible' AND NOT "isHidden"))
  AND ($8::text IS NULL OR "source" = $8::text)
  AND ($9::text IS NULL OR public.normalize_search(search_text) LIKE '%' || public.normalize_search($9::text) || '%')
  AND ($10::date IS NULL OR ("date", "createdAt", "sourceRank", "id") < ($10::date, $11::timestamp, $12::integer, $13::text))
ORDER BY "date" DESC, "createdAt" DESC, "sourceRank" DESC, "id" DESC
LIMIT $14`;

export async function listTransactionsPage(userId: string, input: ListTransactionsPageInput) {
	const limit = Math.min(input.limit ?? 50, 100);
	const currentFilterHash = transactionPageFilterHash(input);
	const cursor = decodeTransactionCursor(input.cursor, currentFilterHash);
	const rows = await queryRaw<TransactionSummaryRow>(listSql, [
		userId,
		input.startDate ?? null,
		input.endDate ?? null,
		input.type ?? null,
		input.categoryId ?? null,
		input.financialAccountId ?? null,
		input.visibility ?? null,
		input.source ?? null,
		input.search?.trim() || null,
		cursor?.date ?? null,
		cursor?.createdAt ?? null,
		cursor?.sourceRank ?? null,
		cursor?.id ?? null,
		limit + 1,
	]);
	const hasMore = rows.length > limit;
	const page = rows.slice(0, limit);
	const transactionIds = page.filter(row => row.sourceRank === 0).map(row => row.id);
	const purchaseIds = page.filter(row => row.sourceRank === 1).map(row => row.id);
	const [transactionTags, purchaseTags, externalReferences, purchaseInstallments] = await Promise.all([
		getTagsByEntity(tagEntityType.transaction, transactionIds),
		getTagsByEntity(tagEntityType.creditPurchase, purchaseIds),
		transactionIds.length
			? queryRows(
					db.sql.public.TransactionExternalReference.select("transactionId", "externalId")
						.where((fields, functions) => functions.in(fields.transactionId, transactionIds))
						.build(),
				)
			: [],
		purchaseIds.length
			? queryRows(
					db.sql.public.CreditPurchase.innerJoin(db.sql.public.CreditCardStatement, (fields, functions) =>
						functions.eq(fields.CreditPurchase.statementId, fields.CreditCardStatement.id),
					)
						.select(fields => ({
							hasImportedAmount: fields.CreditPurchase.hasImportedAmount,
							id: fields.CreditPurchase.id,
							installments: fields.CreditPurchase.installments,
							parentId: fields.CreditPurchase.parentId,
							statementDate: fields.CreditCardStatement.statementDate,
						}))
						.where((fields, functions) =>
							functions.or(
								functions.in(fields.CreditPurchase.id, purchaseIds),
								functions.in(fields.CreditPurchase.parentId, purchaseIds),
							),
						)
						.build(),
				)
			: [],
	]);
	const externalIds = new Map<string, string[]>();
	for (const reference of externalReferences)
		externalIds.set(reference.transactionId, [
			...(externalIds.get(reference.transactionId) ?? []),
			reference.externalId,
		]);
	const purchaseSyncStatus = getCreditPurchaseSyncStatus(purchaseInstallments);
	const items = page.map(({ sourceRank, statementId: _statementId, ...row }) => {
		const tags = (sourceRank === 0 ? transactionTags : purchaseTags).get(row.id) ?? [];
		const references = externalIds.get(row.id) ?? [];
		return {
			...row,
			...(sourceRank === 1 ? purchaseSyncStatus.get(row.id) : {}),
			externalIds: references,
			isSynced: sourceRank === 0 ? references.length > 0 : undefined,
			tagIds: tags.map(tag => tag.id),
			tags,
		};
	});
	const dates = [...new Set(page.map(row => row.date.toISOString().slice(0, 10)))];
	const endingBalanceByDate = await getMonetaryBalancesAtDates(
		userId,
		dates.map(date => new Date(`${date}T12:00:00`)),
	);
	const last = page.at(-1);
	return {
		days: dates.map(date => ({
			date,
			endingBalance: endingBalanceByDate.get(date) ?? 0,
			transactions: items.filter(item => item.date.toISOString().slice(0, 10) === date),
		})),
		hasMore,
		nextCursor:
			hasMore && last
				? encodeTransactionCursor({
						createdAt: last.createdAt.toISOString(),
						date: last.date.toISOString(),
						filterHash: currentFilterHash,
						id: last.id,
						sourceRank: last.sourceRank,
					})
				: null,
	};
}
