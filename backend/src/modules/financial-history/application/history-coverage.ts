import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { coverageWindow, summarizeCoverage } from "../domain/history-coverage";
import { referenceRateCoveredDaysSql } from "./reference-rate-coverage-sql";

interface SummaryRow extends Record<string, unknown> {
	kind: "INTEREST" | "CURRENCY";
	series: string;
	totalRecords: string;
	rangeRecords: string;
	firstDate: string | null;
	lastDate: string | null;
}
interface SavedDay extends Record<string, unknown> {
	kind: string;
	series: string;
	date: string;
}

/** Administrative read-only inventory. Never schedules collection or contacts providers. */
export async function getHistoryCoverage(start?: string, end?: string) {
	let window: ReturnType<typeof coverageWindow>;
	try {
		window = coverageWindow(start, end);
	} catch {
		throw new HttpException("Intervalo histórico inválido: use até 3.660 dias anteriores ao dia atual", 400);
	}
	const parameters = [window.startDate, window.endDate];
	const [summaries, saved, cdi, selic] = await Promise.all([
		queryRaw<SummaryRow>(
			`WITH records AS (
		 SELECT 'INTEREST' AS kind, "type"::text AS series, "date" FROM "ReferenceRate"
		 UNION ALL SELECT 'CURRENCY', "baseCurrency", "date" FROM "CurrencyRateSnapshot"
		), known AS (
		 SELECT 'INTEREST' AS kind, unnest(ARRAY['CDI','SELIC']) AS series
		 UNION SELECT kind, series FROM records
		 UNION SELECT 'CURRENCY', "series" FROM "FinancialHistoryUnit" WHERE "kind"='CURRENCY'
		 UNION SELECT 'CURRENCY', jsonb_array_elements_text("series"::jsonb) FROM "FinancialHistoryCollection" WHERE "kind"='CURRENCY'
		) SELECT known.kind AS "kind", known.series AS "series", count(records."date")::text AS "totalRecords",
		 count(records."date") FILTER (WHERE records."date" BETWEEN $1::date AND $2::date)::text AS "rangeRecords",
		 to_char(min(records."date"),'YYYY-MM-DD') AS "firstDate", to_char(max(records."date"),'YYYY-MM-DD') AS "lastDate"
		 FROM known LEFT JOIN records USING(kind,series) GROUP BY known.kind,known.series ORDER BY known.kind DESC,known.series`,
			parameters,
		),
		queryRaw<SavedDay>(
			`SELECT 'INTEREST' AS kind, "type"::text AS series, to_char("date",'YYYY-MM-DD') AS date
		 FROM "ReferenceRate" WHERE "date" BETWEEN $1::date AND $2::date
		 UNION ALL SELECT 'CURRENCY', "baseCurrency", to_char("date",'YYYY-MM-DD')
		 FROM "CurrencyRateSnapshot" WHERE "date" BETWEEN $1::date AND $2::date`,
			parameters,
		),
		queryRaw<{ date: string }>(referenceRateCoveredDaysSql, ["CDI", ...parameters]),
		queryRaw<{ date: string }>(referenceRateCoveredDaysSql, ["SELIC", ...parameters]),
	]);
	const savedBySeries = new Map<string, Set<string>>();
	for (const day of saved) {
		const key = `${day.kind}:${day.series}`;
		const dates = savedBySeries.get(key) ?? new Set<string>();
		dates.add(day.date);
		savedBySeries.set(key, dates);
	}
	const verified = new Map([
		["CDI", new Set(cdi.map(day => day.date))],
		["SELIC", new Set(selic.map(day => day.date))],
	]);
	const series = summaries.map(row => ({
		...row,
		rangeRecords: Number(row.rangeRecords),
		totalRecords: Number(row.totalRecords),
		...summarizeCoverage(
			window.startDate,
			window.endDate,
			savedBySeries.get(`${row.kind}:${row.series}`) ?? new Set(),
			row.kind === "INTEREST" ? (verified.get(row.series) ?? new Set()) : new Set(),
		),
	}));
	return {
		...window,
		series,
		totals: {
			currencySnapshots: series
				.filter(row => row.kind === "CURRENCY")
				.reduce((total, row) => total + row.totalRecords, 0),
			interestRecords: series
				.filter(row => row.kind === "INTEREST")
				.reduce((total, row) => total + row.totalRecords, 0),
		},
	};
}
