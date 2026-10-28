export const referenceRateAveragesSql = `SELECT type."value" AS "type",
 COUNT(rate."value") > 0 AS "ready", AVG(rate."value") AS "average"
 FROM (VALUES ('CDI'), ('SELIC'), ('IPCA'), ('TR')) type("value")
 LEFT JOIN "public"."ReferenceRate" rate
 ON rate."type"::text = type."value" AND rate."date" BETWEEN $1::date AND $2::date
 AND (rate."type"::text <> 'TR' OR EXTRACT(DAY FROM rate."date")=1)
 GROUP BY type."value"`;
