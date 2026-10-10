export const referenceRateAveragesSql = `SELECT type."value" AS "type",
 COUNT(rate."value") > 0 AS "ready", AVG(rate."value") AS "average"
 FROM (VALUES ('CDI'), ('SELIC')) type("value")
 LEFT JOIN "public"."ReferenceRate" rate
 ON rate."type"::text = type."value" AND rate."date" BETWEEN $1::date AND $2::date
 GROUP BY type."value"`;
