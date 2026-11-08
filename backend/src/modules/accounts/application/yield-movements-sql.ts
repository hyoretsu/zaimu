/** A fiat yield replay runs per fiat holding. Side identity is independent of quantity. */
export const yieldMovementsSql = `
WITH legs AS (
 SELECT movement."id",movement."date",side."side",side."accountId",side."assetCode",side.amount
 FROM "Transaction" movement CROSS JOIN LATERAL (VALUES
 ('ORIGIN',movement."originFinancialAccountId",movement."bookingCurrency",movement."amount"),
 ('DESTINATION',movement."destinationFinancialAccountId",COALESCE(movement."destinationCurrency",movement."bookingCurrency"),COALESCE(movement."destinationAmount",movement."amount"))
 ) side("side","accountId","assetCode",amount)
 UNION ALL
 SELECT movement."id",movement."date",'FEE-' || fee.ordinality,movement."originFinancialAccountId",upper(fee.value->>'assetCode'),(fee.value->>'amount')::numeric
 FROM "Transaction" movement CROSS JOIN LATERAL jsonb_array_elements(movement."fees"::jsonb) WITH ORDINALITY fee(value,ordinality)
 WHERE fee.value->>'type'='FIXED' AND upper(fee.value->>'assetCode')<>movement."bookingCurrency"
)
SELECT legs."id" || ':' || legs."side" || ':' || legs."accountId" AS id,legs.amount,legs."date",legs."assetCode",NULL::numeric AS "destinationAmount",
 CASE WHEN legs."side"='DESTINATION' THEN legs."accountId" END AS "destinationFinancialAccountId",
 CASE WHEN legs."side"<>'DESTINATION' THEN legs."accountId" END AS "originFinancialAccountId"
FROM legs JOIN "FinancialAccount" account ON account."id"=legs."accountId"
JOIN "FinancialAccountAsset" holding ON holding."financialAccountId"=account."id" AND holding."assetCode"=legs."assetCode"
JOIN "Asset" asset ON asset."code"=legs."assetCode" AND asset."kind"='FIAT'
WHERE legs."accountId"=ANY($1::text[])
`;
