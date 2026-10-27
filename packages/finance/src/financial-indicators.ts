/** Official series retain their native accrual period, independently of publication frequency. */
export type FinancialIndicator = "CDI" | "SELIC" | "IPCA" | "TR";
export type RatePeriod = "DAILY_BUSINESS" | "MONTHLY" | "YEARLY";
export const financialIndicators = {
	CDI: { name: "CDI", period: "DAILY_BUSINESS", series: 12, source: "BCB/SGS", unit: "PERCENT" },
	IPCA: { name: "IPCA", period: "MONTHLY", series: 433, source: "BCB/SGS", unit: "PERCENT" },
	SELIC: { name: "Selic", period: "DAILY_BUSINESS", series: 11, source: "BCB/SGS", unit: "PERCENT" },
	TR: { name: "TR", period: "MONTHLY", series: 226, source: "BCB/SGS", unit: "PERCENT" },
} as const;
export interface IndicatorObservation {
	date: string;
	value: number;
	/** Optional publication date prevents using unavailable observations in historical replay. */
	publishedAt?: string;
}
export interface FinancialRateRule {
	indicator?: FinancialIndicator | null;
	percentage?: number | null;
	fixedRate?: number | null;
	fixedPeriod?: "MONTHLY" | "YEARLY";
	basis?: "CALENDAR_365" | "BUSINESS_252";
	lagMonths?: number;
	negativeFloor?: boolean;
}
export function civilDate(value: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data civil inválida");
	const date = new Date(`${value}T12:00:00Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
		throw new Error("Data civil inválida");
	return value;
}
export function shiftMonths(value: string, count: number): string {
	civilDate(value);
	const anchor = new Date(`${value}T12:00:00Z`);
	const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + count, 1, 12));
	date.setUTCDate(
		Math.min(
			anchor.getUTCDate(),
			new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(),
		),
	);
	return date.toISOString().slice(0, 10);
}
export function civilDays(from: string, through: string): number {
	return (
		(Date.parse(`${civilDate(through)}T12:00:00Z`) - Date.parse(`${civilDate(from)}T12:00:00Z`)) /
		86400000
	);
}
export function rateFactor(percent: number, periods = 1): number {
	if (!Number.isFinite(percent) || percent <= -100 || !Number.isFinite(periods) || periods < 0)
		throw new Error("Taxa inválida");
	return (1 + percent / 100) ** periods;
}
/** Percentage applies to the quoted period rate; fixed spread compounds as a separate factor. */
export function composedRateFactor(
	rule: FinancialRateRule,
	referencePercent: number | null,
	periods: number,
	fixedPeriods = periods,
): number {
	if (!Number.isFinite(periods) || periods < 0 || !Number.isFinite(fixedPeriods) || fixedPeriods < 0)
		throw new Error("Período inválido");
	let reference = 1;
	if (rule.indicator) {
		if (referencePercent === null) throw new Error("Indicador indisponível");
		if (!Number.isFinite(rule.percentage) || rule.percentage! < 0) throw new Error("Percentual inválido");
		const value = rule.negativeFloor ? Math.max(0, referencePercent) : referencePercent;
		reference = rateFactor((value * rule.percentage!) / 100, periods);
	}
	return reference * rateFactor(rule.fixedRate ?? 0, fixedPeriods);
}
export interface IndicatorProjection {
	indicator: FinancialIndicator;
	from: string;
	through: string;
	observations: number;
	coverageStart: string | null;
	coverageEnd: string | null;
	complete: boolean;
	/** Geometric mean in the native period, not an arithmetic annual/daily mixture. */
	periodRate: number | null;
}
/** Fixed five-year trailing window. No configurable window or zero fallback. */
export function fiveYearIndicatorProjection(
	indicator: FinancialIndicator,
	observations: IndicatorObservation[],
	asOf: string,
): IndicatorProjection {
	civilDate(asOf);
	const from = shiftMonths(asOf, -60);
	const unique = new Map<string, IndicatorObservation>();
	for (const row of observations) {
		civilDate(row.date);
		if (row.date < from || row.date > asOf || (row.publishedAt && row.publishedAt > asOf)) continue;
		rateFactor(row.value);
		if (unique.has(row.date) && unique.get(row.date)!.value !== row.value)
			throw new Error("Indicador duplicado divergente");
		unique.set(row.date, row);
	}
	const rows = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
	const monthly = financialIndicators[indicator].period === "MONTHLY";
	// TR is a monthly quote published for each anniversary day, never 252 independent daily returns.
	const samples = indicator === "TR" ? rows.filter(row => row.date.endsWith("-01")) : rows;
	const start = samples[0]?.date ?? null;
	const end = samples.at(-1)?.date ?? null;
	const complete =
		start !== null &&
		end !== null &&
		civilDays(from, start) <= (monthly ? 32 : 7) &&
		civilDays(end, asOf) <= (monthly ? 62 : 7) &&
		(monthly
			? new Set(samples.map(row => row.date.slice(0, 7))).size >= 59
			: businessCoverage(samples, from, asOf));
	const logFactor = samples.reduce((sum, row) => sum + Math.log1p(row.value / 100), 0);
	return {
		complete,
		coverageEnd: end,
		coverageStart: start,
		from,
		indicator,
		observations: samples.length,
		periodRate: samples.length ? Math.expm1(logFactor / samples.length) * 100 : null,
		through: asOf,
	};
}
function businessCoverage(rows: IndicatorObservation[], from: string, through: string): boolean {
	// Holidays are absent from daily SGS series; bounded gaps catch missing months without inventing returns.
	if (rows.length < Math.floor(civilDays(from, through) * 0.62)) return false;
	return rows.every((row, index) => index === 0 || civilDays(rows[index - 1]!.date, row.date) <= 7);
}
