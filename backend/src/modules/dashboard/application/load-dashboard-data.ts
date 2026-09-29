import { monetaryBalancesSql } from "~/modules/accounts/application/monetary-balances-sql";
import { withRawTransaction } from "~/shared/infra/sql";
import { dateKey } from "./dashboard-calculations";

type Query = <Row extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<Row[]>;

interface DataRow extends Record<string, unknown> {
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
	institutionId: null | string;
	institutionName: null | string;
	name: null | string;
	type: string;
}

export interface DashboardCard {
	creditLimit: number;
	dueDay: number;
	excludeFromTotals: boolean;
	financialAccountId: string;
	id: string;
	institutionName: null | string;
	name: null | string;
	statementDay: number;
}

export interface DashboardStatement {
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

const overviewSql = `
WITH purchase_charge_input AS (
  SELECT purchase."statementId", purchase."installmentAmount", purchase."currentInstallment",
         purchase."isStatementCharge", purchase."description", purchase."feeAmount", purchase."feeDescription",
         COALESCE(purchase."parentId", purchase."id") AS group_id,
         sum(purchase."installmentAmount") OVER (PARTITION BY COALESCE(purchase."parentId", purchase."id")) AS group_total,
         max(purchase."refinancingFeeAmount") FILTER (WHERE purchase."parentId" IS NULL)
           OVER (PARTITION BY COALESCE(purchase."parentId", purchase."id")) AS group_fee,
         sum(purchase."installmentAmount") OVER (
           PARTITION BY COALESCE(purchase."parentId", purchase."id")
           ORDER BY purchase."currentInstallment", purchase."id"
         ) AS cumulative_amount
  FROM "CreditEntry" purchase
  WHERE purchase."userId" = $1 AND NOT purchase."isSettled"
), purchase_charge_allocations AS (
  SELECT input.*,
         round(COALESCE(input.group_fee, 0) * input.cumulative_amount / NULLIF(input.group_total, 0), 2) AS allocated_fee
  FROM purchase_charge_input input
), purchase_charge_deltas AS (
  SELECT allocated.*,
         lag(allocated.allocated_fee) OVER (
           PARTITION BY allocated.group_id ORDER BY allocated."currentInstallment", allocated."statementId"
         ) AS previous_allocated_fee
  FROM purchase_charge_allocations allocated
), statement_charges AS (
  SELECT allocated."statementId",
         sum(CASE
           WHEN allocated."isStatementCharge"
             OR public.normalize_search(allocated."description") ~ '^(juros|multa|mora|encargos|iof)( |$)'
             OR public.normalize_search(allocated."description") ~ '^imposto.*operac'
             THEN allocated."installmentAmount"
           WHEN allocated."feeDescription" = 'IOF do parcelamento' THEN COALESCE(allocated."feeAmount", 0)
           ELSE allocated.allocated_fee - COALESCE(allocated.previous_allocated_fee, 0)
         END) AS amount
  FROM purchase_charge_deltas allocated
  GROUP BY allocated."statementId"
)
SELECT 'account' AS kind, jsonb_build_object(
  'id', account."id", 'institutionId', account."institutionId", 'institutionName', institution."name",
  'name', account."name", 'type', account."type"::text
) AS data
FROM "FinancialAccount" account
LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
WHERE account."userId" = $1
UNION ALL
SELECT 'card', jsonb_build_object(
  'creditLimit', card."creditLimit", 'excludeFromTotals', card."excludeFromTotals",
  'dueDay', card."dueDay", 'statementDay', card."statementDay",
  'financialAccountId', card."financialAccountId", 'id', card."id",
  'institutionName', institution."name", 'name', account."name"
)
FROM "CreditCard" card
JOIN "FinancialAccount" account ON account."id" = card."financialAccountId"
LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
WHERE account."userId" = $1
UNION ALL
SELECT 'statement', jsonb_build_object(
  'creditCardId', statement."creditCardId", 'dueDate', statement."dueDate", 'id', statement."id",
  'paidAmount', statement."paidAmount", 'statementDate', statement."statementDate",
  'totalAmount', statement."totalAmount", 'chargesAmount', COALESCE(charges.amount, 0)
)
FROM "CreditCardStatement" statement
JOIN "CreditCard" card ON card."id" = statement."creditCardId"
JOIN "FinancialAccount" account ON account."id" = card."financialAccountId"
LEFT JOIN statement_charges charges ON charges."statementId" = statement."id"
WHERE account."userId" = $1
UNION ALL
SELECT 'debt', jsonb_build_object(
  'balance', COALESCE(sum(CASE WHEN event."createdByUserId" = $1 THEN event."effect" ELSE -event."effect" END), 0),
  'id', person."id", 'name', person."name"
)
FROM "DebtPerson" person
LEFT JOIN "DebtEvent" event ON event."debtPersonId" = person."id"
WHERE person."userId" = $1 AND person."hiddenAt" IS NULL
GROUP BY person."id", person."name"`;

const schedulesSql = `
SELECT 'salary' AS kind, to_jsonb(schedule) AS data
FROM (
  SELECT "id", "amount", "endDate", "frequency"::text, "payDay", "dayOfWeek", "source", "startDate"
  FROM "Salary" WHERE "userId" = $1 AND "isActive"
) schedule
UNION ALL
SELECT 'subscription', to_jsonb(schedule)
FROM (
  SELECT "id", "amount", "billingDay", "dayOfWeek", "endDate", "frequency"::text, "name", "startDate", "paymentMethod"::text, "financialAccountId"
  FROM "Subscription" WHERE "userId" = $1 AND "isActive"
) schedule
UNION ALL
SELECT 'recurring', to_jsonb(schedule)
FROM (
  SELECT "id", "amount", "dayOfMonth", "dayOfWeek", "endDate", "frequency"::text, "name", "startDate"
  FROM "RecurringPayment" WHERE "userId" = $1 AND "isActive"
) schedule
UNION ALL
SELECT 'loanPayment', jsonb_build_object(
  'dueDate', payment."dueDate", 'id', payment."id", 'paidDate', payment."paidDate",
  'totalPaid', payment."totalPaid",
  'lender', loan."lender", 'loanId', loan."id"
)
FROM "LoanPayment" payment
JOIN "Loan" loan ON loan."id" = payment."loanId"
WHERE loan."userId" = $1 AND payment."paidDate" IS NULL AND payment."dueDate" >= $2::date`;

const movementsSql = `
SELECT 'flow' AS kind, jsonb_build_object(
  'amount', sum(transaction."amount"), 'date', transaction."date", 'type', transaction."type"::text
) AS data
FROM "Transaction" transaction
WHERE transaction."userId" = $1 AND transaction."date" BETWEEN $2::date AND $3::date
  AND transaction."type" <> 'TRANSFER'
GROUP BY transaction."date", transaction."type"
UNION ALL
SELECT 'linked', jsonb_build_object(
  'date', transaction."date", 'sourceId', COALESCE(transaction."salaryId", transaction."subscriptionId", transaction."recurrenceId")
)
FROM "Transaction" transaction
WHERE transaction."userId" = $1 AND transaction."date" BETWEEN $4::date AND $3::date
  AND (transaction."salaryId" IS NOT NULL OR transaction."subscriptionId" IS NOT NULL OR transaction."recurrenceId" IS NOT NULL)
UNION ALL
SELECT 'forecastTransaction', jsonb_build_object(
  'amount', transaction."amount", 'date', transaction."date", 'description', transaction."description",
  'id', transaction."id", 'type', transaction."type"::text
)
FROM "Transaction" transaction
WHERE transaction."userId" = $1 AND transaction."date" > $4::date AND transaction."date" <= $3::date
  AND transaction."type" <> 'TRANSFER' AND transaction."salaryId" IS NULL
  AND transaction."subscriptionId" IS NULL AND transaction."recurrenceId" IS NULL
UNION ALL
SELECT 'activityDate', jsonb_build_object('date', transaction."date")
FROM "Transaction" transaction
WHERE transaction."userId" = $1 AND transaction."date" BETWEEN $5::date AND $6::date
GROUP BY transaction."date"
UNION ALL
SELECT 'activityDate', jsonb_build_object('date', purchase."purchaseDate")
FROM "CreditEntry" purchase
WHERE purchase."userId" = $1 AND purchase."currentInstallment" = 1
  AND purchase."purchaseDate" BETWEEN $5::date AND $6::date
GROUP BY purchase."purchaseDate"`;

const rowsByKind = (rows: DataRow[], kind: string) =>
	rows.filter(row => row.kind === kind).map(row => row.data);
const asDate = (value: unknown) => new Date(`${String(value).slice(0, 10)}T12:00:00`);
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

export async function loadDashboardData(userId: string, range: DashboardDataRange) {
	return withRawTransaction(async (query: Query) => {
		const overviewRows = await query<DataRow>(overviewSql, [userId]);
		const scheduleRows = await query<DataRow>(schedulesSql, [userId, dateKey(range.today)]);
		const movementRows = await query<DataRow>(movementsSql, [
			userId,
			dateKey(range.comparisonStart),
			dateKey(range.comparisonEnd),
			dateKey(range.projectionStart),
			dateKey(range.periodStart),
			dateKey(range.periodEnd),
		]);
		const activityDates = rowsByKind(movementRows, "activityDate").map(row => asDate(row.date));
		const balanceDates = [...range.balanceDates, ...activityDates];
		const balanceRows = await query<DashboardBalanceRow>(monetaryBalancesSql, [
			userId,
			[...new Set(balanceDates.map(dateKey))],
		]);
		return {
			accounts: rowsByKind(overviewRows, "account") as unknown as DashboardAccount[],
			activityDates,
			balanceRows,
			cards: rowsByKind(overviewRows, "card") as unknown as DashboardCard[],
			debts: rowsByKind(overviewRows, "debt") as unknown as Array<{
				balance: number;
				id: string;
				name: string;
			}>,
			flows: rowsByKind(movementRows, "flow").map(row => ({
				...row,
				date: asDate(row.date),
			})) as unknown as DashboardFlow[],
			forecastTransactions: rowsByKind(movementRows, "forecastTransaction").map(row => ({
				...row,
				date: asDate(row.date),
			})) as unknown as DashboardForecastTransaction[],
			linkedTransactions: rowsByKind(movementRows, "linked"),
			loanPayments: rowsByKind(scheduleRows, "loanPayment").map(row => ({
				...row,
				dueDate: asDate(row.dueDate),
				paidDate: row.paidDate ? asDate(row.paidDate) : null,
			})) as unknown as DashboardLoanPayment[],
			recurring: rowsByKind(scheduleRows, "recurring").map(asSchedule),
			salaries: rowsByKind(scheduleRows, "salary").map(asSchedule),
			statements: rowsByKind(overviewRows, "statement").map(row => ({
				...(row as unknown as Omit<DashboardStatement, "dueDate" | "statementDate">),
				dueDate: asDate(row.dueDate),
				statementDate: asDate(row.statementDate),
			})),
			subscriptions: rowsByKind(scheduleRows, "subscription").map(asSchedule),
		};
	});
}
