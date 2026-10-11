export interface HistoryCoverageSeries {
	kind: "INTEREST" | "CURRENCY";
	series: string;
	totalRecords: number;
	rangeRecords: number;
	firstDate: string | null;
	lastDate: string | null;
	savedDays: number;
	verifiedDays: number;
	missingDays: number;
	days: { date: string; status: "SAVED" | "VERIFIED_NO_PUBLICATION" | "MISSING" }[];
	missingRanges: { startDate: string; endDate: string }[];
}
export interface HistoryCoverage {
	startDate: string;
	endDate: string;
	requestedDays: number;
	totals: { interestRecords: number; currencySnapshots: number };
	series: HistoryCoverageSeries[];
}
