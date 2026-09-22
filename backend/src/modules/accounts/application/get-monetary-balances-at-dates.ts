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
		 ), daily_movements AS (
		   SELECT t."date",
		          sum(
		            CASE WHEN destination."type" NOT IN ('CREDIT_CARD', 'INVESTMENT', 'REWARDS', 'SAVINGS')
		                 THEN t."amount" ELSE 0 END
		            - CASE WHEN origin."type" NOT IN ('CREDIT_CARD', 'INVESTMENT', 'REWARDS', 'SAVINGS')
		                   THEN t."amount" ELSE 0 END
		          ) AS amount
		   FROM "Transaction" t
		   LEFT JOIN "FinancialAccount" origin
		     ON origin."id" = t."originFinancialAccountId"
		   LEFT JOIN "FinancialAccount" destination
		     ON destination."id" = t."destinationFinancialAccountId"
		   WHERE t."userId" = $1
		     AND t."date" <= (SELECT max(date) FROM requested_dates)
		   GROUP BY t."date"
		 ), cumulative_balances AS (
		   SELECT "date", sum(amount) OVER (ORDER BY "date") AS balance
		   FROM daily_movements
		 )
		 SELECT requested.date,
		        COALESCE((
		          SELECT cumulative.balance
		          FROM cumulative_balances cumulative
		          WHERE cumulative."date" <= requested.date
		          ORDER BY cumulative."date" DESC
		          LIMIT 1
		        ), 0)::numeric AS balance
		 FROM requested_dates requested
		 ORDER BY requested.date`,
		[userId, dateKeys],
	);
	return new Map(rows.map(row => [row.date.toISOString().slice(0, 10), Number(row.balance)]));
}
