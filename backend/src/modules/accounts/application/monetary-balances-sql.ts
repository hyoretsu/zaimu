export const monetaryBalancesSql = `
WITH requested_dates AS (
  SELECT unnest($2::date[]) AS date
)
SELECT to_char(requested.date, 'YYYY-MM-DD') AS date, account."id" AS "accountId",
       (COALESCE(adjustment."balance", 0) + COALESCE(movements.amount, 0) + COALESCE(yields.amount, 0))::numeric AS balance
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
  SELECT sum(CASE WHEN transaction."destinationFinancialAccountId" = account."id" THEN transaction."amount" ELSE 0 END
           - CASE WHEN transaction."originFinancialAccountId" = account."id" THEN transaction."amount" ELSE 0 END) AS amount
  FROM "Transaction" transaction
  WHERE transaction."userId" = $1 AND transaction."date" <= requested.date
    AND (adjustment."date" IS NULL OR transaction."date" > adjustment."date")
    AND (transaction."originFinancialAccountId" = account."id" OR transaction."destinationFinancialAccountId" = account."id")
) movements ON true
LEFT JOIN LATERAL (
  SELECT sum(entry."amount") AS amount
  FROM "FinancialAccountYield" entry
  WHERE entry."financialAccountId" = account."id" AND entry."date" <= requested.date
    AND (adjustment."date" IS NULL OR entry."date" > adjustment."date")
    AND NOT entry."isExcluded" AND entry."amount" IS NOT NULL
) yields ON true
WHERE account."userId" = $1 AND account."type" IN ('CHECKING', 'CASH', 'SAVINGS')
ORDER BY requested.date, account."id"`;
