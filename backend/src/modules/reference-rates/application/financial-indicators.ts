import {
	type FinancialIndicator,
	financialIndicators,
	financialReferenceResolver,
	fiveYearIndicatorProjection,
	type IndicatorObservation,
} from "@zaimu/finance/financial-indicators";
import type { LoanReference } from "@zaimu/finance/loan-contract";
import { queryRaw } from "~/shared/infra/sql";
export async function financialIndicatorContext(asOf: string) {
	const rows = await queryRaw<{ type: FinancialIndicator; date: Date; value: string }>(
		`SELECT "type","date","value" FROM "ReferenceRate" WHERE "date" BETWEEN ($1::date - interval '5 years') AND $1::date ORDER BY "date"`,
		[asOf],
	);
	const projections = Object.keys(financialIndicators).map(key => {
		const indicator = key as FinancialIndicator;
		return fiveYearIndicatorProjection(
			indicator,
			rows
				.filter(row => row.type === indicator)
				.map(row => ({ date: row.date.toISOString().slice(0, 10), value: Number(row.value) })),
			asOf,
		);
	});
	const observations: Record<string, IndicatorObservation[]> = Object.fromEntries(
		Object.keys(financialIndicators).map(key => [
			key,
			rows
				.filter(row => row.type === key)
				.map(row => ({ date: row.date.toISOString().slice(0, 10), value: Number(row.value) })),
		]),
	);
	const reference: LoanReference = financialReferenceResolver({ observations, projections });
	return { observations, projections, reference };
}
