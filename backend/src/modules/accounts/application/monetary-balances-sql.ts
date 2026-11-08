import { cashbackReversalsSql } from "./cashback-reversals-sql";

/** Every ledger key includes the denomination; quantities never cross assets. */
export const monetaryBalancesSql = `
WITH requested_dates AS (
 SELECT DISTINCT unnest($2::date[]) AS date
), owned_accounts AS MATERIALIZED (
 SELECT account."id", holding."assetCode", asset."kind" AS "assetKind",
 CASE WHEN rewards."assetCode"=holding."assetCode" THEN rewards."initialBalance" ELSE 0 END AS "initialBalance"
 FROM "FinancialAccount" account
 JOIN "FinancialAccountAsset" holding ON holding."financialAccountId"=account."id"
 JOIN "Asset" asset ON asset."code"=holding."assetCode"
 LEFT JOIN "RewardsAccount" rewards ON rewards."financialAccountId"=account."id"
 WHERE account."userId"=$1 AND (account."type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT') OR rewards."kind"='CASHBACK')
), checkpoints AS MATERIALIZED (
 SELECT checkpoint."financialAccountId" AS "accountId", checkpoint."assetCode", checkpoint."date", checkpoint."balance"
 FROM "BalanceAdjustment" checkpoint JOIN owned_accounts account
 ON account."id"=checkpoint."financialAccountId" AND account."assetCode"=checkpoint."assetCode"
 WHERE checkpoint."userId"=$1 AND checkpoint."date" <= (SELECT max(date) FROM requested_dates)
), reward_credits AS MATERIALIZED (
 SELECT purchase."cashbackAccountId" AS "accountId",purchase."cashbackCurrency" AS "assetCode",purchase."purchaseDate" AS date,purchase."cashbackAmount" AS amount,purchase."cashbackYieldPeriod"::text AS period,purchase."cashbackYieldReferenceRate" AS rate,purchase."cashbackYieldReferencePercentage" AS percentage
 FROM "CreditPurchaseRecord" purchase JOIN owned_accounts account ON account."id"=purchase."cashbackAccountId" AND account."assetCode"=purchase."cashbackCurrency" WHERE purchase."userId"=$1
 UNION ALL
 SELECT reversal."cashbackAccountId",reversal."assetCode",reversal.date,reversal.amount,purchase."cashbackYieldPeriod"::text,purchase."cashbackYieldReferenceRate",purchase."cashbackYieldReferencePercentage"
 FROM (${cashbackReversalsSql}) reversal JOIN "CreditPurchaseRecord" purchase ON purchase."id"=reversal."purchaseId" JOIN owned_accounts account ON account."id"=reversal."cashbackAccountId" AND account."assetCode"=reversal."assetCode"
 UNION ALL
 SELECT credit."financialAccountId",credit."assetCode",credit.date,credit.amount,credit."yieldPeriod"::text,credit."yieldReferenceRate",credit."yieldReferencePercentage" FROM "DetachedRewardCredit" credit JOIN owned_accounts account ON account."id"=credit."financialAccountId" AND account."assetCode"=credit."assetCode"
), movements AS (
 SELECT side."accountId", side."assetCode", movement."date", side.amount
 FROM "Transaction" movement
 CROSS JOIN LATERAL (VALUES
 (movement."originFinancialAccountId",movement."bookingCurrency",-movement."amount"),
 (movement."destinationFinancialAccountId",COALESCE(movement."destinationCurrency",movement."bookingCurrency"),COALESCE(movement."destinationAmount",movement."amount"))
 ) side("accountId","assetCode",amount)
 JOIN owned_accounts account ON account."id"=side."accountId" AND account."assetCode"=side."assetCode"
 WHERE movement."userId"=$1 AND movement."date" <= (SELECT max(date) FROM requested_dates)
 UNION ALL
 -- Same-asset fees are already included in the booked debit. Network fees in another asset are separate.
 SELECT movement."originFinancialAccountId",upper(fee->>'assetCode'),movement."date",-(fee->>'amount')::numeric
 FROM "Transaction" movement CROSS JOIN LATERAL jsonb_array_elements(movement."fees"::jsonb) fee
 JOIN owned_accounts account ON account."id"=movement."originFinancialAccountId" AND account."assetCode"=upper(fee->>'assetCode')
 WHERE movement."userId"=$1 AND movement."date" <= (SELECT max(date) FROM requested_dates)
 AND fee->>'type'='FIXED' AND upper(fee->>'assetCode')<>movement."bookingCurrency"
 UNION ALL
 SELECT payment."financialAccountId",COALESCE(payment."accountCurrency",payment."currency"),payment."paidDate",-COALESCE(payment."accountAmount",payment."totalPaid")
 FROM "LoanPayment" payment JOIN "Loan" loan ON loan."id"=payment."loanId"
 JOIN owned_accounts account ON account."id"=payment."financialAccountId" AND account."assetCode"=COALESCE(payment."accountCurrency",payment."currency")
 WHERE loan."userId"=$1 AND payment."paidDate" <= (SELECT max(date) FROM requested_dates)
 UNION ALL
 SELECT yield."financialAccountId",yield."assetCode",yield."date",yield."amount"
 FROM "FinancialAccountYield" yield JOIN owned_accounts account ON account."id"=yield."financialAccountId" AND account."assetCode"=yield."assetCode" AND account."assetKind"='FIAT'
 WHERE yield."date" <= (SELECT max(date) FROM requested_dates) AND NOT yield."isExcluded" AND yield."amount" IS NOT NULL
 UNION ALL
 SELECT credit."accountId",credit."assetCode",credit.date,credit.amount FROM reward_credits credit WHERE credit.date <= (SELECT max(date) FROM requested_dates)
 UNION ALL
 -- Periodic accrual uses the original snapshot and anniversary, including negative refund credits.
 SELECT credit."accountId",credit."assetCode",anniversary.date::date,
 credit.amount * (power(1 + credit.rate * credit.percentage / 10000, anniversary.periods) - power(1 + credit.rate * credit.percentage / 10000, anniversary.periods-1))
 FROM reward_credits credit
 CROSS JOIN LATERAL generate_series(1, CASE WHEN credit.period='YEARLY' THEN extract(year FROM age((SELECT max(date) FROM requested_dates),credit.date))::integer ELSE (extract(year FROM age((SELECT max(date) FROM requested_dates),credit.date))*12+extract(month FROM age((SELECT max(date) FROM requested_dates),credit.date)))::integer END) periods(value)
 CROSS JOIN LATERAL (SELECT credit.date + periods.value * CASE WHEN credit.period='YEARLY' THEN interval '1 year' ELSE interval '1 month' END AS date,periods.value AS periods) anniversary
 WHERE credit.rate>0 AND credit.percentage>0 AND credit.period IN ('MONTHLY','YEARLY') AND anniversary.date <= (SELECT max(date) FROM requested_dates)
), points AS (
 SELECT "accountId","assetCode",date,sum(amount) AS amount FROM (
 SELECT "accountId","assetCode",date,amount FROM movements
 UNION ALL SELECT account."id",account."assetCode",requested.date,0::numeric FROM owned_accounts account CROSS JOIN requested_dates requested
 UNION ALL SELECT "accountId","assetCode",date,0::numeric FROM checkpoints
 ) point GROUP BY "accountId","assetCode",date
), running AS MATERIALIZED (
 SELECT "accountId","assetCode",date,sum(amount) OVER (PARTITION BY "accountId","assetCode" ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS amount FROM points
)
SELECT to_char(requested.date,'YYYY-MM-DD') AS date,account."id" AS "accountId",account."assetCode",account."assetCode" AS currency,account."assetKind",
 (COALESCE(adjustment."balance",account."initialBalance",0)+COALESCE(current.amount,0)-COALESCE(prior.amount,0))::text AS balance
FROM requested_dates requested CROSS JOIN owned_accounts account
LEFT JOIN LATERAL (
 SELECT checkpoint.date,checkpoint.balance FROM checkpoints checkpoint
 WHERE checkpoint."accountId"=account."id" AND checkpoint."assetCode"=account."assetCode" AND checkpoint.date<=requested.date
 ORDER BY checkpoint.date DESC LIMIT 1
) adjustment ON true
LEFT JOIN running current ON current."accountId"=account."id" AND current."assetCode"=account."assetCode" AND current.date=requested.date
LEFT JOIN running prior ON prior."accountId"=account."id" AND prior."assetCode"=account."assetCode" AND prior.date=adjustment.date
ORDER BY requested.date,account."id",account."assetCode"
`;
