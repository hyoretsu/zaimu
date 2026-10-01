import { type BookPurchase, type CreditBook, moneyCents, replayCreditBook } from "@zaimu/finance/credit-book";
import type { RecurrenceDefinition } from "@zaimu/finance/recurrence";
import { projectRecurrenceCreditBook } from "@zaimu/finance/recurrence-projection";
export interface CreditOverviewRow extends Record<string, unknown> {
	data: Record<string, unknown>;
	kind: string;
}

export interface CreditOverviewCard {
	creditLimit: number;
	dueDay: number;
	excludeFromTotals: boolean;
	financialAccountId: string;
	id: string;
	ignoreStatementsBefore: null | string;
	institutionId: null | string;
	institutionName: null | string;
	name: null | string;
	refundPolicy: CreditBook["card"]["refundPolicy"];
	statementDay: number;
	workingDueDate: boolean;
}

export interface CreditOverviewStatement {
	balanceAmount: number;
	chargesAmount: number;
	creditCardId: string;
	dueDate: Date;
	id: string;
	paidAmount: number;
	statementDate: Date;
	totalAmount: number;
}

export const creditOverviewSql = `
WITH visible_cards AS (
  SELECT card.*, account."userId", account."institutionId", institution."creditRefundPolicy" AS "refundPolicy"
  FROM "CreditCard" card
  JOIN "FinancialAccount" account ON account."id" = card."financialAccountId"
  LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
  WHERE account."userId" = $1 AND NOT account."isHidden"
), purchase_plans AS (
  SELECT purchase."id" AS "purchaseId",
         jsonb_agg(plan."amount" ORDER BY plan."number") AS "installmentAmounts",
         jsonb_agg(plan."number" ORDER BY plan."number") FILTER (WHERE plan."hasImportedAmount") AS "importedNumbers",
         jsonb_agg(CASE WHEN plan."statementDate" IS NULL THEN NULL ELSE jsonb_build_object(
           'statementDate', plan."statementDate", 'dueDate', plan."dueDate"
         ) END ORDER BY plan."number") AS "statementDates"
  FROM "CreditPurchaseRecord" purchase
  JOIN visible_cards card ON card."id" = purchase."creditCardId"
  JOIN "CreditInstallmentPlan" plan ON plan."purchaseId" = purchase."id"
  GROUP BY purchase."id"
)
SELECT 'card' AS kind, jsonb_build_object(
  'creditLimit', card."creditLimit", 'excludeFromTotals', card."excludeFromTotals",
  'dueDay', card."dueDay", 'statementDay', card."statementDay",
  'financialAccountId', card."financialAccountId", 'id', card."id",
  'ignoreStatementsBefore', card."ignoreStatementsBefore", 'institutionId', card."institutionId",
  'institutionName', institution."name", 'name', account."name", 'refundPolicy', card."refundPolicy",
  'workingDueDate', card."workingDueDate"
) AS data
FROM visible_cards card
JOIN "FinancialAccount" account ON account."id" = card."financialAccountId"
LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
UNION ALL
SELECT 'statement', jsonb_build_object(
  'creditCardId', statement."creditCardId", 'dueDate', statement."dueDate", 'id', statement."id",
  'paidAmount', statement."paidAmount", 'statementDate', statement."statementDate",
  'totalAmount', statement."totalAmount", 'isPaid', statement."isPaid", 'isFullySynced', statement."isFullySynced"
)
FROM "CreditCardStatement" statement
JOIN visible_cards card ON card."id" = statement."creditCardId"
UNION ALL
SELECT 'purchase', to_jsonb(purchase) || jsonb_build_object(
  'installmentAmounts', plans."installmentAmounts", 'importedNumbers', COALESCE(plans."importedNumbers", '[]'::jsonb),
  'statementDates', plans."statementDates"
)
FROM "CreditPurchaseRecord" purchase
JOIN visible_cards card ON card."id" = purchase."creditCardId"
JOIN purchase_plans plans ON plans."purchaseId" = purchase."id"
UNION ALL
SELECT 'installment', to_jsonb(installment) || jsonb_build_object('creditCardId', purchase."creditCardId")
FROM "CreditInstallmentRecord" installment
JOIN "CreditPurchaseRecord" purchase ON purchase."id" = installment."purchaseId"
JOIN visible_cards card ON card."id" = purchase."creditCardId"
UNION ALL
SELECT 'refund', to_jsonb(refund) || jsonb_build_object('creditCardId', purchase."creditCardId")
FROM "CreditRefundRecord" refund
JOIN "CreditPurchaseRecord" purchase ON purchase."id" = refund."purchaseId"
JOIN visible_cards card ON card."id" = purchase."creditCardId"
UNION ALL
SELECT 'charge', to_jsonb(charge) || jsonb_build_object('creditCardId', statement."creditCardId")
FROM "CreditStatementCharge" charge
JOIN "CreditCardStatement" statement ON statement."id" = charge."statementId"
JOIN visible_cards card ON card."id" = statement."creditCardId"
UNION ALL
SELECT 'payment', jsonb_build_object(
  'amount', payment."amount", 'creditCardId', payment."paymentCreditCardId", 'date', payment."date", 'id', payment."id"
)
FROM "Transaction" payment
JOIN visible_cards card ON card."id" = payment."paymentCreditCardId"
WHERE payment."userId" = $1`;
const asDate = (value: unknown) => new Date(`${String(value).slice(0, 10)}T12:00:00`);
const asDateKey = (value: unknown) => String(value).slice(0, 10);
const asTimestamp = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
const groupByCard = (rows: CreditOverviewRow[], kind: string) => {
	const grouped = new Map<string, Record<string, unknown>[]>();
	for (const row of rows) {
		if (row.kind !== kind) continue;
		const cardId = String(row.data.creditCardId);
		const group = grouped.get(cardId) ?? [];
		group.push(row.data);
		grouped.set(cardId, group);
	}
	return grouped;
};

export function replayOverviewStatements(
	userId: string,
	cards: CreditOverviewCard[],
	rows: CreditOverviewRow[],
	asOf: string,
	recurrences: RecurrenceDefinition[] = [],
	through = asOf,
): CreditOverviewStatement[] {
	const purchasesByCard = groupByCard(rows, "purchase");
	const installmentsByCard = groupByCard(rows, "installment");
	const refundsByCard = groupByCard(rows, "refund");
	const chargesByCard = groupByCard(rows, "charge");
	const statementsByCard = groupByCard(rows, "statement");
	const paymentsByCard = groupByCard(rows, "payment");
	return cards.flatMap(card => {
		const purchases = (purchasesByCard.get(card.id) ?? []).map(row => ({
			...row,
			createdAt: asTimestamp(row.createdAt),
			debtSplitRule: null,
			installmentAmountsCents: (row.installmentAmounts as unknown[]).map(amount =>
				moneyCents(Number(amount), 1),
			),
			installmentImportedNumbers: (row.importedNumbers as unknown[]).map(Number),
			installmentStatementDates: (row.statementDates as Array<Record<string, unknown> | null>).map(dates =>
				dates ? { dueDate: asDateKey(dates.dueDate), statementDate: asDateKey(dates.statementDate) } : null,
			),
			purchaseDate: asDateKey(row.purchaseDate),
			subscriptionOccurrenceDate: row.subscriptionOccurrenceDate
				? asDateKey(row.subscriptionOccurrenceDate)
				: null,
			tagIds: [],
			totalAmountCents: moneyCents(Number(row.totalAmount), 1),
			updatedAt: asTimestamp(row.updatedAt),
		})) as unknown as BookPurchase[];
		const book: CreditBook = {
			card: {
				dueDay: Number(card.dueDay),
				id: card.id,
				ignoreStatementsBefore: card.ignoreStatementsBefore ? asDateKey(card.ignoreStatementsBefore) : null,
				institutionId: card.institutionId,
				refundPolicy: card.refundPolicy,
				statementDay: Number(card.statementDay),
				userId,
				workingDueDate: Boolean(card.workingDueDate),
			},
			charges: (chargesByCard.get(card.id) ?? []).map(row => ({
				amountCents: moneyCents(Number(row.amount), 1),
				chargeDate: asDateKey(row.chargeDate),
				description: String(row.description),
				externalId: row.externalId as string | null,
				id: String(row.id),
				isSettled: Boolean(row.isSettled),
				settledByPurchaseId: row.settledByPurchaseId as string | null,
				statementId: String(row.statementId),
				time: row.time as string | null,
			})),
			installments: (installmentsByCard.get(card.id) ?? []).map(row => ({
				amountCents: moneyCents(Number(row.amount), 1),
				hasImportedAmount: Boolean(row.hasImportedAmount),
				id: String(row.id),
				isSettled: Boolean(row.isSettled),
				number: Number(row.number),
				occurrenceDate: asDateKey(row.occurrenceDate),
				purchaseId: String(row.purchaseId),
				settledByPurchaseId: row.settledByPurchaseId as string | null,
				statementId: String(row.statementId),
			})),
			payments: (paymentsByCard.get(card.id) ?? []).map(row => ({
				amount: Number(row.amount),
				date: asDateKey(row.date),
				id: String(row.id),
			})),
			purchases,
			refunds: (refundsByCard.get(card.id) ?? []).map(row => ({
				amountCents: moneyCents(Number(row.amount), 1),
				cancellationEligible: Boolean(row.cancellationEligible),
				createdAt: asTimestamp(row.createdAt),
				creditDate: asDateKey(row.creditDate),
				creditStatementId: String(row.statementId),
				deletedAt: row.deletedAt ? asTimestamp(row.deletedAt) : null,
				externalId: row.externalId as string | null,
				id: String(row.id),
				policy: row.policy as CreditBook["refunds"][number]["policy"],
				purchaseId: String(row.purchaseId),
				time: row.time as string | null,
				updatedAt: asTimestamp(row.updatedAt),
			})),
			statements: (statementsByCard.get(card.id) ?? []).map(row => ({
				creditCardId: card.id,
				dueDate: asDateKey(row.dueDate),
				id: String(row.id),
				isFullySynced: Boolean(row.isFullySynced),
				isPaid: Boolean(row.isPaid),
				paidAmount: Number(row.paidAmount),
				statementDate: asDateKey(row.statementDate),
				totalAmount: Number(row.totalAmount),
			})),
		};
		return replayCreditBook(
			projectRecurrenceCreditBook(
				book,
				recurrences,
				asOf < through
					? new Date(new Date(`${asOf}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
					: asOf,
				through,
			),
			asOf,
		).statements.map(statement => ({
			...statement,
			dueDate: asDate(statement.dueDate),
			statementDate: asDate(statement.statementDate),
		})) as CreditOverviewStatement[];
	});
}
