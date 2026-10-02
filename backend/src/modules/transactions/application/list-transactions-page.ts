import { getMonetaryBalancesAtDates } from "~/modules/accounts/application/get-monetary-balances-at-dates";
import { getTagsByEntity, tagEntityType } from "~/modules/categories/application/tag-assignments";
import { getCreditPurchaseSyncStatus } from "~/modules/creditCards/domain/credit-purchase-sync-status";
import { getDebtSplitReturns } from "~/modules/debts/application/debt-splits";
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
	type?: "EXPENSE" | "INCOME" | "REFUND" | "TRANSFER";
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
	createdAt: Date;
	cursorCreatedAt: string;
	cursorDate: string;
	creditCardId: null | string;
	creditCardName: null | string;
	creditCardStatementDate: Date | null;
	paymentCreditCardId: null | string;
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
	source: "CREDIT_CARD" | "FINANCIAL_ACCOUNT";
	sourceName: null | string;
	sourceRank: number;
	statementId: null | string;
	storeName: null | string;
	time: null | string;
	type: "EXPENSE" | "INCOME" | "REFUND" | "TRANSFER";
}

export const transactionPageFilterHash = (input: ListTransactionsPageInput, userId?: string) =>
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
				userId: userId ?? null,
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
    t."description", t."storeName", t."isHidden", t."type"::text AS "type",
    t."createdAt",
    t."originFinancialAccountId", t."destinationFinancialAccountId",
    origin."type"::text AS "originAccountType", destination."type"::text AS "destinationAccountType",
    origin_rewards."kind"::text AS "originAccountRewardsKind",
    destination_rewards."kind"::text AS "destinationAccountRewardsKind",
    COALESCE(origin."name", origin_institution."name") AS "originName",
    COALESCE(destination."name", destination_institution."name") AS "destinationName",
    t."recurrenceId", t."recurrenceOccurrenceDate", t."paymentCreditCardId",
    NULL::date AS "creditCardStatementDate",
    payment_card."id" AS "creditCardId",
    COALESCE(payment_account."name", payment_institution."name") AS "creditCardName",
    CASE WHEN t."type" <> 'TRANSFER'
      AND COALESCE(destination."type", origin."type") = 'CREDIT_CARD'
      AND t."recurrenceId" IS NULL
      THEN 'CREDIT_CARD' ELSE 'FINANCIAL_ACCOUNT' END AS "source",
    CASE WHEN t."type" = 'INCOME' THEN COALESCE(destination."name", destination_institution."name")
      ELSE COALESCE(origin."name", origin_institution."name") END AS "sourceName",
    NULL::numeric AS "feeAmount", NULL::text AS "feeDescription", NULL::boolean AS "isRefund",
    NULL::boolean AS "hasRefund", NULL::text AS "refundOfPurchaseId", NULL::smallint AS "currentInstallment",
    NULL::smallint AS "installments", NULL::numeric AS "installmentAmount", NULL::text AS "parentId",
    NULL::text AS "statementId", 0 AS "sourceRank",
    concat_ws(' ', t."amount"::text,
      concat('R$ ', translate(to_char(t."amount", 'FM999,999,999,990.00'), ',.', '.,')),
      to_char(t."date", 'DD/MM/YYYY'), to_char(t."date", 'YYYY-MM-DD'), t."time"::text,
      t."description", t."storeName",
      CASE t."type" WHEN 'INCOME' THEN 'Entrada' WHEN 'EXPENSE' THEN 'Saída'
        WHEN 'TRANSFER' THEN 'Transferência' ELSE 'Reembolso' END,
      CASE WHEN t."isHidden" THEN 'Oculta' ELSE 'Visível' END,
      origin."name", origin_institution."name", destination."name", destination_institution."name",
      payment_account."name", payment_institution."name",
      CASE WHEN debt_split."id" IS NOT NULL THEN 'Dívida' END,
      (SELECT string_agg(concat_ws(' ', person."name", participant."description"), ' ')
       FROM "DebtSplitParticipant" participant
       JOIN "DebtPerson" person ON person."id" = participant."debtPersonId"
       WHERE participant."debtSplitId" = debt_split."id"),
      (SELECT string_agg(tag."name", ' ') FROM "TagAssignment" assignment
       JOIN "Category" tag ON tag."id" = assignment."categoryId"
       WHERE assignment."entityType" = 'TRANSACTION' AND assignment."entityId" = t."id")) AS search_text
  FROM "Transaction" t
  LEFT JOIN "FinancialAccount" origin ON origin."id" = t."originFinancialAccountId"
  LEFT JOIN "FinancialInstitution" origin_institution ON origin_institution."id" = origin."institutionId"
  LEFT JOIN "RewardsAccount" origin_rewards ON origin_rewards."financialAccountId" = origin."id"
  LEFT JOIN "FinancialAccount" destination ON destination."id" = t."destinationFinancialAccountId"
  LEFT JOIN "FinancialInstitution" destination_institution ON destination_institution."id" = destination."institutionId"
  LEFT JOIN "RewardsAccount" destination_rewards ON destination_rewards."financialAccountId" = destination."id"
  LEFT JOIN "CreditCard" payment_card ON payment_card."id" = t."paymentCreditCardId"
  LEFT JOIN "FinancialAccount" payment_account ON payment_account."id" = payment_card."financialAccountId"
  LEFT JOIN "FinancialInstitution" payment_institution ON payment_institution."id" = payment_account."institutionId"
  LEFT JOIN "DebtSplit" debt_split ON debt_split."transactionId" = t."id" AND debt_split."userId" = t."userId"
  WHERE t."userId" = $1

  UNION ALL

  SELECT
    purchase."id", abs(purchase."totalAmount")::numeric AS "amount", purchase."purchaseDate" AS "date",
    purchase."time"::text AS "time", purchase."description", purchase."storeName", false AS "isHidden",
    CASE WHEN purchase."isRefund" THEN 'REFUND' ELSE 'EXPENSE' END AS "type",
    purchase."createdAt",
    account."id" AS "originFinancialAccountId", NULL::text AS "destinationFinancialAccountId",
    'CREDIT_CARD' AS "originAccountType", NULL::text AS "destinationAccountType",
    NULL::text AS "originAccountRewardsKind", NULL::text AS "destinationAccountRewardsKind",
    COALESCE(account."name", institution."name", 'Cartão de crédito') AS "originName",
    NULL::text AS "destinationName", purchase."recurrenceId", purchase."recurrenceOccurrenceDate", NULL::text AS "paymentCreditCardId",
    statement."statementDate" AS "creditCardStatementDate", card."id" AS "creditCardId",
    COALESCE(account."name", institution."name", 'Cartão de crédito') AS "creditCardName",
    'CREDIT_CARD' AS "source", COALESCE(account."name", institution."name", 'Cartão de crédito') AS "sourceName",
    purchase."feeAmount", purchase."feeDescription", purchase."isRefund",
    EXISTS (SELECT 1 FROM "CreditRefundRecord" refund WHERE refund."purchaseId" = purchase."purchaseId" AND refund."deletedAt" IS NULL) AS "hasRefund",
    purchase."refundOfPurchaseId", purchase."currentInstallment", purchase."installments",
    purchase."installmentAmount", purchase."parentId", purchase."statementId", 1 AS "sourceRank",
    concat_ws(' ', purchase."totalAmount"::text,
      concat('R$ ', translate(to_char(abs(purchase."totalAmount"), 'FM999,999,999,990.00'), ',.', '.,')),
      to_char(purchase."purchaseDate", 'DD/MM/YYYY'), to_char(purchase."purchaseDate", 'YYYY-MM-DD'),
      purchase."time"::text, purchase."description", purchase."storeName",
      CASE WHEN purchase."isRefund" THEN 'Reembolso' ELSE 'Saída' END,
      account."name", institution."name", purchase."feeDescription", purchase."feeAmount"::text,
      to_char(statement."statementDate", 'MM/YYYY'), purchase."installments"::text,
      CASE WHEN purchase."installments" IS NOT NULL THEN concat(purchase."installments", 'x') END,
      purchase."installmentAmount"::text,
      CASE WHEN debt_split."id" IS NOT NULL THEN 'Dívida' END,
      (SELECT string_agg(concat_ws(' ', person."name", participant."description"), ' ')
       FROM "DebtSplitParticipant" participant
       JOIN "DebtPerson" person ON person."id" = participant."debtPersonId"
       WHERE participant."debtSplitId" = debt_split."id"),
      (SELECT string_agg(tag."name", ' ') FROM "TagAssignment" assignment
       JOIN "Category" tag ON tag."id" = assignment."categoryId"
       WHERE assignment."entityType" = 'CREDIT_PURCHASE' AND assignment."entityId" = purchase."purchaseId")) AS search_text
  FROM "CreditConsumption" purchase
  LEFT JOIN "CreditCardStatement" statement ON statement."id" = purchase."statementId"
  JOIN "CreditCard" card ON card."id" = purchase."creditCardId"
  JOIN "FinancialAccount" account ON account."id" = card."financialAccountId"
  LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
  LEFT JOIN "DebtSplit" debt_split ON debt_split."creditPurchaseId" = purchase."id" AND debt_split."userId" = purchase."userId"
  WHERE purchase."userId" = $1 AND purchase."currentInstallment" = 1
)
-- Preserve the database's timestamp without time zone for the next page boundary.
SELECT combined.*, to_char("date", 'YYYY-MM-DD') AS "cursorDate",
  to_char("createdAt", 'YYYY-MM-DD HH24:MI:SS.MS') AS "cursorCreatedAt"
FROM combined
WHERE ($2::date IS NULL OR "date" >= $2::date)
  AND ($3::date IS NULL OR "date" <= $3::date)
  AND ($4::text IS NULL OR "type" = $4::text)
  AND ($5::text IS NULL OR EXISTS (
    SELECT 1 FROM "TagAssignment" assignment
    WHERE assignment."entityId" = CASE WHEN combined."sourceRank"=0 THEN combined."id" ELSE COALESCE((SELECT "purchaseId" FROM "CreditEntryReference" WHERE "id"=combined."id"),combined."id") END AND assignment."categoryId" = $5::text
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
	const currentFilterHash = transactionPageFilterHash(input, userId);
	const cursor = decodeTransactionCursor(input.cursor, currentFilterHash);
	let sql = input.search?.trim()
		? listSql
		: listSql.replace(/ {4}concat_ws\(' ',[\s\S]*?\) AS search_text/g, "NULL::text AS search_text");
	if (!input.search?.trim() && !input.categoryId && !input.source) {
		const candidates = `WITH candidates AS MATERIALIZED (
			SELECT * FROM (
				SELECT t."id", t."date", t."createdAt", 0 AS "sourceRank"
				FROM "Transaction" t WHERE t."userId"=$1
				AND ($2::date IS NULL OR t."date">=$2) AND ($3::date IS NULL OR t."date"<=$3)
				AND ($4::text IS NULL OR t."type"::text=$4)
				AND ($6::text IS NULL OR t."originFinancialAccountId"=$6 OR t."destinationFinancialAccountId"=$6)
				AND ($7::text IS NULL OR t."isHidden"=($7='hidden'))
				UNION ALL
				SELECT p."id", p."purchaseDate", p."createdAt", 1
				FROM "CreditConsumption" p JOIN "CreditCard" c ON c."id"=p."creditCardId"
				WHERE p."userId"=$1 AND p."currentInstallment"=1
				AND ($2::date IS NULL OR p."purchaseDate">=$2) AND ($3::date IS NULL OR p."purchaseDate"<=$3)
				AND ($4::text IS NULL OR CASE WHEN p."isRefund" THEN 'REFUND' ELSE 'EXPENSE' END=$4)
				AND ($6::text IS NULL OR c."financialAccountId"=$6)
				AND ($7::text IS NULL OR $7='visible')
			) entries
			WHERE ($10::date IS NULL OR ("date", "createdAt", "sourceRank", "id") < ($10::date, $11::timestamp, $12::integer, $13::text))
			ORDER BY "date" DESC, "createdAt" DESC, "sourceRank" DESC, "id" DESC LIMIT $14
		), combined AS (`;
		sql = sql
			.replace("WITH combined AS (", candidates)
			.replace(
				'FROM "Transaction" t\n',
				'FROM "Transaction" t JOIN candidates candidate ON candidate."id"=t."id" AND candidate."sourceRank"=0\n',
			)
			.replace(
				'FROM "CreditConsumption" purchase\n',
				'FROM "CreditConsumption" purchase JOIN candidates candidate ON candidate."id"=purchase."id" AND candidate."sourceRank"=1\n',
			);
	}
	const rows = await queryRaw<TransactionSummaryRow>(sql, [
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
	if (page.length === 0) return { days: [], hasMore: false, nextCursor: null };
	const transactionIds = page.filter(row => row.sourceRank === 0).map(row => row.id);
	const purchaseIds = page.filter(row => row.sourceRank === 1).map(row => row.id);
	const [
		transactionTags,
		purchaseTags,
		externalReferences,
		purchaseInstallments,
		transactionDebtSplits,
		purchaseDebtSplits,
	] = await Promise.all([
		getTagsByEntity(tagEntityType.transaction, transactionIds),
		getTagsByEntity(tagEntityType.creditPurchase, purchaseIds),
		transactionIds.length
			? queryRows(
					db.sql.public.TransactionExternalReference.select("transactionId", "externalId")
						.where((fields, functions) => functions.in(fields.transactionId, transactionIds))
						.build(),
				)
			: [],
		queryRaw<{
			id: string;
			parentId: string | null;
			hasImportedAmount: boolean;
			installments: number;
			statementDate: Date;
		}>(
			`SELECT p."id",p."parentId",p."hasImportedAmount",p."installments",s."statementDate" FROM "CreditEntry" p JOIN "CreditCardStatement" s ON s."id"=p."statementId" WHERE p."purchaseId"=ANY($1)`,
			[purchaseIds],
		),
		getDebtSplitReturns(
			"transactionId",
			page.filter(row => row.sourceRank === 0).map(row => ({ amount: Number(row.amount), id: row.id })),
		),
		getDebtSplitReturns(
			"creditPurchaseId",
			page.filter(row => row.sourceRank === 1).map(row => ({ amount: Number(row.amount), id: row.id })),
		),
	]);
	const externalIds = new Map<string, string[]>();
	for (const reference of externalReferences)
		externalIds.set(reference.transactionId, [
			...(externalIds.get(reference.transactionId) ?? []),
			reference.externalId,
		]);
	const purchaseSyncStatus = getCreditPurchaseSyncStatus(purchaseInstallments);
	const items = page.map(
		({
			sourceRank,
			cursorCreatedAt: _cursorCreatedAt,
			cursorDate: _cursorDate,
			search_text: _searchText,
			...row
		}) => {
			const tags = (sourceRank === 0 ? transactionTags : purchaseTags).get(row.id) ?? [];
			const references = externalIds.get(row.id) ?? [];
			return {
				...row,
				...(sourceRank === 1 ? purchaseSyncStatus.get(row.id) : {}),
				debtSplitSummary: (() => {
					const split = (sourceRank === 0 ? transactionDebtSplits : purchaseDebtSplits).get(row.id);
					return split
						? {
								ownerAmount: split.ownerAmount,
								participants: split.participants.map(participant => ({
									amount: participant.amount,
									debtPersonName: participant.debtPersonName,
								})),
							}
						: null;
				})(),
				isSynced: sourceRank === 0 ? references.length > 0 : undefined,
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
	);
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
						createdAt: last.cursorCreatedAt,
						date: last.cursorDate,
						filterHash: currentFilterHash,
						id: last.id,
						sourceRank: last.sourceRank,
					})
				: null,
	};
}
