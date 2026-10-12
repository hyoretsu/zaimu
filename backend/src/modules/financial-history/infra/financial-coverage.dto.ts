import { t } from "elysia";

export const FinancialCoverageQuery = t.Object({
	endDate: t.Optional(t.String({ format: "date" })),
	startDate: t.Optional(t.String({ format: "date" })),
});
const NullableString = t.Nullable(t.String());
export const FinancialCoverageReturn = t.Object({
	accounts: t.Array(
		t.Object({
			countryCode: NullableString,
			currency: t.String(),
			id: t.String(),
			institutionId: NullableString,
			name: NullableString,
		}),
	),
	endDate: t.String(),
	items: t.Array(
		t.Object({
			affectedAccountIds: t.Array(t.String()),
			countryCode: NullableString,
			currency: NullableString,
			endDate: NullableString,
			gaps: t.Array(t.Object({ endDate: t.String(), startDate: t.String() })),
			id: t.String(),
			institutionId: NullableString,
			kind: t.Union([
				t.Literal("ASSOCIATION"),
				t.Literal("CALENDAR"),
				t.Literal("TAX"),
				t.Literal("POLICY"),
				t.Literal("PROFILE_HISTORY"),
				t.Literal("ACCOUNT_COUNTRY"),
			]),
			name: t.String(),
			profileId: NullableString,
			source: t.String(),
			startDate: NullableString,
			status: t.String(),
			version: NullableString,
		}),
	),
	startDate: t.String(),
});
export type FinancialCoverageReturn = typeof FinancialCoverageReturn.static;
