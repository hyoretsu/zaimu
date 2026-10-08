import { format } from "date-fns";
import { getHistoryCollection } from "~/modules/financial-history/application/history-collections";
import { queryRaw } from "~/shared/infra/sql";
import { referenceRateAveragesSql } from "../domain/reference-rate-averages-sql";
import { referenceRateWindow } from "../domain/reference-rate-window";

export { referenceRateAveragesSql };

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
	const [collection] = await queryRaw<{ id: string }>(
		`SELECT "id" FROM "FinancialHistoryCollection" WHERE "deduplicationKey"=$1`,
		[`INTEREST:CDI,SELIC:${startDate}:${endDate}`],
	);
	const history = collection ? await getHistoryCollection(collection.id) : null;
	return {
		averages,
		collectionId: history?.id ?? null,
		endDate,
		progress: history?.progress ?? null,
		ready: averages.CDI !== null && averages.SELIC !== null,
		startDate,
	};
}
