import { format } from "date-fns";
import { queryRaw } from "~/shared/infra/sql";
import { referenceRateWindow } from "../domain/reference-rate-window";

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

export async function getReferenceRateAverages(today = new Date()) {
	const window = referenceRateWindow(today);
	const startDate = format(window.startDate, "yyyy-MM-dd");
	const endDate = format(window.endDate, "yyyy-MM-dd");
	const rows = await queryRaw<{ type: "CDI" | "SELIC"; ready: boolean; average: string | null }>(
		referenceRateAveragesSql,
		[startDate, endDate],
	);
	const averages = { CDI: null as number | null, SELIC: null as number | null };
	for (const row of rows) if (row.ready && row.average !== null) averages[row.type] = Number(row.average);
	return { averages, endDate, ready: averages.CDI !== null && averages.SELIC !== null, startDate };
}
