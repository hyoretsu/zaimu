/** Cumulative asset-unit rounding conserves the booked reward across multiple refunds. */
export const cashbackReversalsSql = `
SELECT purchase."cashbackAccountId", purchase."cashbackCurrency" AS "assetCode", purchase."id" AS "purchaseId", refund."creditDate" AS "date",
 -(round(purchase."cashbackAmount" * refund.cumulative / purchase."totalAmount", precision.digits)
 -round(purchase."cashbackAmount" * (refund.cumulative-refund."amount") / purchase."totalAmount", precision.digits)) AS amount
FROM (
 SELECT r.*, sum(r."amount") OVER (PARTITION BY r."purchaseId" ORDER BY r."creditDate",r."createdAt",r."id") AS cumulative
 FROM "CreditRefundRecord" r WHERE r."deletedAt" IS NULL
) refund
JOIN "CreditPurchaseRecord" purchase ON purchase."id"=refund."purchaseId"
JOIN "FinancialAccount" account ON account."id"=purchase."cashbackAccountId"
JOIN "Asset" reward_asset ON reward_asset."code"=purchase."cashbackCurrency"
CROSS JOIN LATERAL (SELECT reward_asset."decimals"::integer AS digits) precision
WHERE purchase."totalAmount">0 AND purchase."cashbackAmount">0`;
