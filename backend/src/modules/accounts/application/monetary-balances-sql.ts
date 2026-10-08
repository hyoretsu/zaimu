export const monetaryBalancesSql = `
WITH requested_dates AS (
 SELECT unnest($2::date[]) AS date
), owned_accounts AS MATERIALIZED (
 SELECT account."id", rewards."initialBalance" FROM "FinancialAccount" account
 LEFT JOIN "RewardsAccount" rewards ON rewards."financialAccountId"=account."id"
 WHERE account."userId"=$1 AND (account."type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT') OR rewards."kind"='CASHBACK')
), checkpoints AS MATERIALIZED (
 SELECT checkpoint."financialAccountId" AS "accountId", checkpoint."date", checkpoint."balance"
 FROM "BalanceAdjustment" checkpoint JOIN owned_accounts account ON account."id"=checkpoint."financialAccountId"
 WHERE checkpoint."userId"=$1 AND checkpoint."date" <= (SELECT max(date) FROM requested_dates)
), movements AS (
 SELECT side."accountId", movement."date", side.amount
 FROM "Transaction" movement
 CROSS JOIN LATERAL (VALUES (movement."originFinancialAccountId",-movement."amount"), (movement."destinationFinancialAccountId",COALESCE(movement."destinationAmount",movement."amount"))) side("accountId",amount)
 JOIN owned_accounts account ON account."id"=side."accountId"
 WHERE movement."userId"=$1 AND movement."date" <= (SELECT max(date) FROM requested_dates)
 UNION ALL
 SELECT yield."financialAccountId",yield."date",yield."amount"
 FROM "FinancialAccountYield" yield JOIN owned_accounts account ON account."id"=yield."financialAccountId"
 WHERE yield."date" <= (SELECT max(date) FROM requested_dates) AND NOT yield."isExcluded" AND yield."amount" IS NOT NULL
 UNION ALL
 SELECT purchase."cashbackAccountId",purchase."purchaseDate",purchase."cashbackAmount"
 FROM "CreditPurchaseRecord" purchase JOIN owned_accounts account ON account."id"=purchase."cashbackAccountId"
 WHERE purchase."userId"=$1 AND purchase."purchaseDate" <= (SELECT max(date) FROM requested_dates)
), points AS (
 SELECT "accountId", date, sum(amount) AS amount FROM (
 SELECT "accountId",date,amount FROM movements
 UNION ALL SELECT account."id", requested.date,0::numeric FROM owned_accounts account CROSS JOIN requested_dates requested
 UNION ALL SELECT "accountId",date,0::numeric FROM checkpoints
 ) point GROUP BY "accountId",date
), running AS MATERIALIZED (
 SELECT "accountId",date,sum(amount) OVER (PARTITION BY "accountId" ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS amount FROM points
)
SELECT to_char(requested.date,'YYYY-MM-DD') AS date, account."id" AS "accountId",
 (COALESCE(adjustment."balance",account."initialBalance",0) + COALESCE(current.amount,0) - COALESCE(prior.amount,0))::numeric AS balance
FROM requested_dates requested CROSS JOIN owned_accounts account
LEFT JOIN LATERAL (
 SELECT checkpoint.date,checkpoint.balance FROM checkpoints checkpoint
 WHERE checkpoint."accountId"=account."id" AND checkpoint.date<=requested.date
 ORDER BY checkpoint.date DESC LIMIT 1
) adjustment ON true
LEFT JOIN running current ON current."accountId"=account."id" AND current.date=requested.date
LEFT JOIN running prior ON prior."accountId"=account."id" AND prior.date=adjustment.date
ORDER BY requested.date,account."id"
`;
