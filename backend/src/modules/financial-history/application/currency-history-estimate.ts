import { queryRaw } from "~/shared/infra/sql";
import { dateKey, weightedCurrencyRate } from "../domain/collection";
import { getHistoryCollection } from "./history-collections";

/** Reads requested coverage without adding any new demand. */
export async function getCurrencyHistoryEstimate(collectionId: string, target: string) {
	const collection = await getHistoryCollection(collectionId);
	if (collection?.kind !== "CURRENCY") return null;
	const reference = new Date(`${collection.endDate}T00:00:00Z`);
	reference.setUTCDate(reference.getUTCDate() + 1);
	const rows = await queryRaw<{ date: string; baseCurrency: string; rate: string | null }>(
		`SELECT to_char("date",'YYYY-MM-DD') AS "date", "baseCurrency", "rates"->>$4 AS "rate" FROM "CurrencyRateSnapshot" WHERE "date">=$1::date AND "date"<=$2::date AND "baseCurrency"=ANY($3::text[]) ORDER BY "date"`,
		[collection.startDate, collection.endDate, collection.series, target.toUpperCase()],
	);
	return {
		collectionId,
		currency: target.toUpperCase(),
		endDate: collection.endDate,
		estimates: collection.series.map(baseCurrency => ({
			baseCurrency,
			...weightedCurrencyRate(
				rows
					.filter(row => row.baseCurrency === baseCurrency && row.rate !== null)
					.map(row => ({ date: row.date, rate: Number(row.rate) })),
				dateKey(reference),
			),
		})),
		method: "EXPONENTIAL_90_DAY_HALF_LIFE" as const,
		progress: collection.progress,
		startDate: collection.startDate,
	};
}
