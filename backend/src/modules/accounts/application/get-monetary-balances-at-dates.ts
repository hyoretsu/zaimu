import { queryRaw } from "~/shared/infra/sql";

interface MonetaryBalanceRow {
	[key: string]: unknown;
	balance: number;
	date: Date;
}

export async function getMonetaryBalancesAtDates(userId: string, dates: Date[]) {
	const dateKeys = [...new Set(dates.map(date => date.toISOString().slice(0, 10)))];
	if (dateKeys.length === 0) return new Map<string, number>();
	const rows = await queryRaw<MonetaryBalanceRow>(
		`WITH requested_dates AS (
		   SELECT unnest($2::date[]) AS date
		 )
		 SELECT requested.date,
		        COALESCE(sum(COALESCE(adjustment."balance", 0) + COALESCE(movements.amount, 0)), 0)::numeric AS balance
		 FROM requested_dates requested
		 CROSS JOIN "FinancialAccount" account
		 LEFT JOIN LATERAL (
		   SELECT checkpoint."date", checkpoint."balance"
		   FROM "BalanceAdjustment" checkpoint
		   WHERE checkpoint."userId" = $1 AND checkpoint."financialAccountId" = account."id"
		     AND checkpoint."date" <= requested.date
		   ORDER BY checkpoint."date" DESC LIMIT 1
		 ) adjustment ON true
		 LEFT JOIN LATERAL (
		   SELECT sum(CASE WHEN t."destinationFinancialAccountId" = account."id" THEN t."amount" ELSE 0 END
		            - CASE WHEN t."originFinancialAccountId" = account."id" THEN t."amount" ELSE 0 END) AS amount
		   FROM "Transaction" t
		   WHERE t."userId" = $1 AND t."date" <= requested.date
		     AND (adjustment."date" IS NULL OR t."date" > adjustment."date")
		     AND (t."originFinancialAccountId" = account."id" OR t."destinationFinancialAccountId" = account."id")
		 ) movements ON true
		 WHERE account."userId" = $1 AND account."type" IN ('CHECKING', 'CASH')
		 GROUP BY requested.date
		 ORDER BY requested.date`,
		[userId, dateKeys],
	);
	return new Map(rows.map(row => [row.date.toISOString().slice(0, 10), Number(row.balance)]));
}
