import { format } from "date-fns";
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
	return { averages, endDate, ready: averages.CDI !== null && averages.SELIC !== null, startDate };
}
