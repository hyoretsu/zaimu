/** Saved publications and verified no-publication days are both covered. */
export const referenceRateCoveredDaysSql = `
SELECT to_char("date", 'YYYY-MM-DD') AS "date"
FROM "ReferenceRate" WHERE "type"::text=$1 AND "date" BETWEEN $2::date AND $3::date
UNION
SELECT to_char(day, 'YYYY-MM-DD') AS "date"
FROM "OutboxEvent" event
CROSS JOIN LATERAL generate_series(
 greatest((event."payload"->>'startDate')::date,$2::date),
 least((event."payload"->>'endDate')::date,$3::date), interval '1 day'
) day
WHERE event."eventType"='referenceRate.historyFetched'
AND event."payload"->>'referenceType'=$1
AND (event."payload"->>'startDate')::date<=$3::date
AND (event."payload"->>'endDate')::date>=$2::date`;
