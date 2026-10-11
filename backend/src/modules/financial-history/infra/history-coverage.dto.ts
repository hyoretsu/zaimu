import { t } from "elysia";

export const HistoryCoverageReturn = t.Object({
	endDate: t.String(),
	requestedDays: t.Number(),
	series: t.Array(
		t.Object({
			days: t.Array(
				t.Object({
					date: t.String(),
					status: t.Union([t.Literal("SAVED"), t.Literal("VERIFIED_NO_PUBLICATION"), t.Literal("MISSING")]),
				}),
			),
			firstDate: t.Nullable(t.String()),
			kind: t.Union([t.Literal("INTEREST"), t.Literal("CURRENCY")]),
			lastDate: t.Nullable(t.String()),
			missingDays: t.Number(),
			missingRanges: t.Array(t.Object({ endDate: t.String(), startDate: t.String() })),
			rangeRecords: t.Number(),
			savedDays: t.Number(),
			series: t.String(),
			totalRecords: t.Number(),
			verifiedDays: t.Number(),
		}),
	),
	startDate: t.String(),
	totals: t.Object({ currencySnapshots: t.Number(), interestRecords: t.Number() }),
});
export type HistoryCoverageReturn = typeof HistoryCoverageReturn.static;
