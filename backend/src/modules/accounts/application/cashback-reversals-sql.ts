/** Cumulative ISO rounding conserves the booked reward across multiple refunds. */
export const cashbackReversalsSql = `
SELECT purchase."cashbackAccountId", purchase."id" AS "purchaseId", refund."creditDate" AS "date",
 -(round(purchase."cashbackAmount" * refund.cumulative / purchase."totalAmount", precision.digits)
 -round(purchase."cashbackAmount" * (refund.cumulative-refund."amount") / purchase."totalAmount", precision.digits)) AS amount
FROM (
 SELECT r.*, sum(r."amount") OVER (PARTITION BY r."purchaseId" ORDER BY r."creditDate",r."createdAt",r."id") AS cumulative
 FROM "CreditRefundRecord" r WHERE r."deletedAt" IS NULL
) refund
JOIN "CreditPurchaseRecord" purchase ON purchase."id"=refund."purchaseId"
JOIN "FinancialAccount" account ON account."id"=purchase."cashbackAccountId"
CROSS JOIN LATERAL (SELECT CASE
 WHEN account."currency" IN ('BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF') THEN 0
 WHEN account."currency" IN ('BHD','IQD','JOD','KWD','LYD','OMR','TND') THEN 3
 WHEN account."currency" IN ('CLF','UYW') THEN 4
 ELSE 2 END AS digits) precision
WHERE purchase."totalAmount">0 AND purchase."cashbackAmount">0`;
