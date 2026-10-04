import type { CreditBook } from "@zaimu/finance/credit-book";
import { replayOverviewStatements as replayDashboardStatements } from "~/modules/creditCards/application/credit-overview";
import { projectedYieldContext } from "~/modules/reference-rates/application/projected-yield-context";

export { replayOverviewStatements as replayDashboardStatements } from "~/modules/creditCards/application/credit-overview";

import { monetaryBalancesSql } from "~/modules/accounts/application/monetary-balances-sql";
import { normalizeRecurrence } from "~/modules/recurring/application/recurrences";
import { withRawTransaction } from "~/shared/infra/sql";
import { dateKey } from "./dashboard-calculations";

type Query = <Row extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<Row[]>;

export interface DashboardDataRow extends Record<string, unknown> {
	data: Record<string, unknown>;
	kind: string;
}

export interface DashboardBalanceRow extends Record<string, unknown> {
	accountId: string;
	balance: number;
	date: string;
}

export interface DashboardAccount {
	id: string;
	isPrimary?: boolean;
	institutionId: null | string;
	institutionName: null | string;
	name: null | string;
	type: string;
}

export interface DashboardCard {
	paymentAccountId?: null | string;
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

export interface DashboardStatement {
	recurringAmount?: number;
	balanceAmount: number;
	chargesAmount: number;
	creditCardId: string;
	dueDate: Date;
	id: string;
	paidAmount: number;
	statementDate: Date;
	totalAmount: number;
}

export interface DashboardSchedule {
	amount: number;
	billingDay?: null | number;
	dayOfMonth?: null | number;
	dayOfWeek: null | number;
	endDate: Date | null;
	frequency: string;
	id: string;
	name?: string;
	financialAccountId?: null | string;
	paymentMethod?: string;
	payDay?: null | number;
	source?: string;
	startDate: Date;
}

export interface DashboardFlow {
	cardPayment?: boolean;
	id?: string;
	recurringAmount?: number;
	originAccountId?: null | string;
	destinationAccountId?: null | string;
	recurring?: boolean;
	amount: number;
	date: Date;
	type: string;
}

export interface DashboardForecastTransaction extends DashboardFlow {
	description: null | string;
	id: string;
}

export interface DashboardLoanPayment {
	dueDate: Date;
	id: string;
	lender: string;
	loanId: string;
	paidDate: Date | null;
	totalPaid: number;
}

const comparisonOverviewSql = `
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
SELECT 'account' AS kind, jsonb_build_object(
  'id', account."id", 'institutionId', account."institutionId", 'institutionName', institution."name",
  'name', account."name", 'type', CASE WHEN rewards."kind" = 'CASHBACK' THEN 'CASHBACK' ELSE account."type"::text END, 'isPrimary', account."isPrimary"
) AS data
FROM "FinancialAccount" account
LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
LEFT JOIN "RewardsAccount" rewards ON rewards."financialAccountId" = account."id"
WHERE account."userId" = $1 AND NOT account."isHidden"
UNION ALL
SELECT 'card', jsonb_build_object(
  'creditLimit', card."creditLimit", 'excludeFromTotals', card."excludeFromTotals", 'paymentAccountId', card."paymentAccountId",
  'dueDay', card."dueDay", 'statementDay', card."statementDay",
  'financialAccountId', card."financialAccountId", 'id', card."id",
  'ignoreStatementsBefore', card."ignoreStatementsBefore", 'institutionId', card."institutionId",
  'institutionName', institution."name", 'name', account."name", 'refundPolicy', card."refundPolicy",
  'workingDueDate', card."workingDueDate"
)
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
WHERE payment."userId" = $1
`;

const overviewSql = `${comparisonOverviewSql}
UNION ALL
SELECT 'debt', jsonb_build_object(
  'balance', COALESCE(sum(CASE WHEN event."createdByUserId" = $1 THEN event."effect" ELSE -event."effect" END), 0),
  'id', person."id", 'name', person."name"
)
FROM "DebtPerson" person
LEFT JOIN "DebtEvent" event ON event."debtPersonId" = person."id" AND event."deletedAt" IS NULL
WHERE person."userId" = $1 AND person."hiddenAt" IS NULL
GROUP BY person."id", person."name"`;

const schedulesSql = `
SELECT 'recurrence' AS kind, to_jsonb(schedule) AS data
FROM "Recurrence" schedule WHERE "userId" = $1 AND "isActive"
UNION ALL
SELECT 'occurrence', jsonb_build_object('recurrenceId', occurrence."recurrenceId", 'date', occurrence."date")
FROM "RecurrenceOccurrence" occurrence
JOIN "Recurrence" schedule ON schedule."id" = occurrence."recurrenceId"
WHERE schedule."userId" = $1 AND occurrence."date" >= $2::date
UNION ALL
SELECT 'loanPayment', jsonb_build_object(
  'dueDate', payment."dueDate", 'id', payment."id", 'paidDate', payment."paidDate",
  'totalPaid', payment."totalPaid",
  'lender', loan."lender", 'loanId', loan."id"
)
FROM "LoanPayment" payment
JOIN "Loan" loan ON loan."id" = payment."loanId"
WHERE loan."userId" = $1 AND payment."paidDate" IS NULL AND payment."dueDate" >= $2::date`;

const comparisonMovementsSql = `
SELECT 'flow' AS kind, jsonb_build_object(
  'cardPayment', transaction."paymentCreditCardId" IS NOT NULL, 'id', transaction."id", 'amount', transaction."amount", 'date', transaction."date", 'type', transaction."type"::text,
  'originAccountId', transaction."originFinancialAccountId", 'destinationAccountId', transaction."destinationFinancialAccountId", 'recurring', transaction."recurrenceId" IS NOT NULL
) AS data
FROM "Transaction" transaction
WHERE transaction."userId" = $1 AND transaction."date" BETWEEN $2::date AND $3::date

UNION ALL
SELECT 'flow', jsonb_build_object('amount', entry."amount", 'date', entry."date", 'type', 'INCOME', 'recurring', false)
FROM "FinancialAccountYield" entry
JOIN "FinancialAccount" account ON account."id" = entry."financialAccountId"
WHERE account."userId" = $1 AND entry."date" BETWEEN $2::date AND LEAST($3::date, CURRENT_DATE)
  AND NOT entry."isExcluded" AND entry."amount" IS NOT NULL
UNION ALL
SELECT 'flow', jsonb_build_object('amount', purchase."cashbackAmount", 'date', purchase."purchaseDate", 'type', 'INCOME', 'recurring', false)
FROM "CreditPurchaseRecord" purchase
JOIN "FinancialAccount" account ON account."id" = purchase."cashbackAccountId"
WHERE purchase."userId" = $1 AND purchase."purchaseDate" BETWEEN $2::date AND LEAST($3::date, CURRENT_DATE)
  AND (account."type" IN ('CHECKING', 'CASH', 'SAVINGS', 'INVESTMENT') OR EXISTS (SELECT 1 FROM "RewardsAccount" r WHERE r."financialAccountId"=account."id" AND r."kind"='CASHBACK')) AND purchase."cashbackAmount" > 0
UNION ALL
SELECT 'linked', jsonb_build_object(
  'date', transaction."date", 'sourceId', transaction."recurrenceId"
)
FROM "Transaction" transaction
WHERE transaction."userId" = $1 AND transaction."date" BETWEEN $4::date AND $3::date
  AND transaction."recurrenceId" IS NOT NULL
`;

const movementsSql = `${comparisonMovementsSql}
UNION ALL
SELECT 'forecastTransaction', jsonb_build_object(
  'amount', transaction."amount", 'date', transaction."date", 'description', transaction."description",
  'id', transaction."id", 'type', transaction."type"::text
)
FROM "Transaction" transaction
WHERE transaction."userId" = $1 AND transaction."date" > $4::date AND transaction."date" <= $3::date
  AND transaction."type" <> 'TRANSFER'
  AND transaction."recurrenceId" IS NULL
UNION ALL
SELECT 'activityDate', jsonb_build_object('date', transaction."date")
FROM "Transaction" transaction
WHERE transaction."userId" = $1 AND transaction."date" BETWEEN $5::date AND $6::date
GROUP BY transaction."date"
UNION ALL
SELECT 'activityDate', jsonb_build_object('date', purchase."purchaseDate")
FROM "CreditPurchaseRecord" purchase
WHERE purchase."userId" = $1
  AND purchase."purchaseDate" BETWEEN $5::date AND $6::date
GROUP BY purchase."purchaseDate"`;

const rowsByKind = (rows: DashboardDataRow[], kind: string) =>
	rows.filter(row => row.kind === kind).map(row => row.data);
const asDate = (value: unknown) => new Date(`${String(value).slice(0, 10)}T12:00:00`);
const asDateKey = (value: unknown) => String(value).slice(0, 10);
const asTimestamp = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
const asSchedule = (row: Record<string, unknown>) =>
	({
		...row,
		endDate: row.endDate ? asDate(row.endDate) : null,
		startDate: asDate(row.startDate),
	}) as unknown as DashboardSchedule;

export interface DashboardDataRange {
	balanceDates: Date[];
	comparisonEnd: Date;
	comparisonStart: Date;
	periodEnd: Date;
	periodStart: Date;
	projectionStart: Date;
	today: Date;
}

export async function loadDashboardData(userId: string, range: DashboardDataRange, comparisonOnly = false) {
	const loaded = await withRawTransaction(query => loadDashboardRows(query, userId, range, comparisonOnly));
	loaded.projectedYields = await projectedYieldContext(
		userId,
		loaded.accounts.map(account => account.id),
	);
	return loaded;
}

export async function loadDashboardRows(
	query: Query,
	userId: string,
	range: DashboardDataRange,
	comparisonOnly = false,
) {
	const overviewRows = await query<DashboardDataRow>(comparisonOnly ? comparisonOverviewSql : overviewSql, [
		userId,
	]);
	const scheduleRows = await query<DashboardDataRow>(schedulesSql, [userId, dateKey(range.today)]);
	const movementRows = await query<DashboardDataRow>(comparisonOnly ? comparisonMovementsSql : movementsSql, [
		userId,
		dateKey(range.comparisonStart < range.projectionStart ? range.comparisonStart : range.projectionStart),
		dateKey(range.comparisonEnd),
		dateKey(range.projectionStart),
		...(comparisonOnly ? [] : [dateKey(range.periodStart), dateKey(range.periodEnd)]),
	]);
	const activityDates = rowsByKind(movementRows, "activityDate").map(row => asDate(row.date));
	const balanceDates = [...range.balanceDates, ...activityDates];
	const balanceRows = await query<DashboardBalanceRow>(monetaryBalancesSql, [
		userId,
		[...new Set(balanceDates.map(dateKey))],
	]);
	const cards = rowsByKind(overviewRows, "card") as unknown as DashboardCard[];
	const recurrences = rowsByKind(scheduleRows, "recurrence").map(normalizeRecurrence);
	replayDashboardStatements(userId, cards, overviewRows, dateKey(range.today));
	const recurringPayments = new Map(
		rowsByKind(overviewRows, "payment").map(row => [String(row.id), Number(row.recurringAmount ?? 0)]),
	);
	const projectedCardPaymentAmounts = new Map<string, number>();
	return {
		...({ projectedCardPaymentAmounts } as { projectedCardPaymentAmounts?: Map<string, number> }),
		accounts: rowsByKind(overviewRows, "account") as unknown as DashboardAccount[],
		activityDates,
		balanceRows,
		cards,
		debts: rowsByKind(overviewRows, "debt") as unknown as Array<{
			balance: number;
			id: string;
			name: string;
		}>,
		flows: rowsByKind(movementRows, "flow").map(row => ({
			...row,
			...(row.cardPayment ? { recurringAmount: recurringPayments.get(String(row.id)) ?? 0 } : {}),
			date: asDate(row.date),
		})) as unknown as DashboardFlow[],
		forecastTransactions: rowsByKind(movementRows, "forecastTransaction").map(row => ({
			...row,
			date: asDate(row.date),
		})) as unknown as DashboardForecastTransaction[],
		linkedTransactions: [
			...rowsByKind(movementRows, "linked"),
			...rowsByKind(scheduleRows, "occurrence").map(row => ({
				date: row.date,
				sourceId: row.recurrenceId,
			})),
		],
		loanPayments: rowsByKind(scheduleRows, "loanPayment").map(row => ({
			...row,
			dueDate: asDate(row.dueDate),
			paidDate: row.paidDate ? asDate(row.paidDate) : null,
		})) as unknown as DashboardLoanPayment[],
		projectedStatements: replayDashboardStatements(
			userId,
			cards,
			overviewRows,
			dateKey(range.today),
			recurrences,
			dateKey(range.comparisonEnd),
			rowsByKind(scheduleRows, "occurrence") as unknown as Array<{ recurrenceId: string; date: string }>,
			projectedCardPaymentAmounts,
		),
		projectedYields: null as Awaited<ReturnType<typeof projectedYieldContext>> | null,
		recurrences,
		recurring: [],
		salaries: [],
		statements: comparisonOnly
			? []
			: replayDashboardStatements(userId, cards, overviewRows, dateKey(range.today)),
		subscriptions: [],
	};
}
