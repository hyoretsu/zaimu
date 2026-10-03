export const referenceRateAveragesSql = `WITH coverage AS (
 SELECT type."value" AS "type", NOT EXISTS (
 SELECT 1 FROM generate_series($1::date, $2::date, interval '1 day') day
 WHERE NOT EXISTS (
 SELECT 1 FROM "public"."OutboxEvent" event
 WHERE event."eventType" = 'referenceRate.historyFetched'
 AND event."payload"->>'referenceType' = type."value"
 AND (event."payload"->>'startDate')::date <= day::date
 AND (event."payload"->>'endDate')::date >= day::date
 )) AS "ready" FROM (VALUES ('CDI'), ('SELIC')) type("value")
) SELECT coverage."type", coverage."ready", AVG(rate."value") AS "average"
 FROM coverage LEFT JOIN "public"."ReferenceRate" rate
 ON rate."type"::text = coverage."type" AND rate."date" BETWEEN $1::date AND $2::date
 GROUP BY coverage."type", coverage."ready"`;
