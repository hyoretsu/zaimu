import { t } from "elysia";

const NullableRate = t.Optional(t.Nullable(t.Number({ minimum: 0 })));
const RateProperties = {
	yieldFixedRate: NullableRate,
	yieldReferencePercentage: NullableRate,
	yieldReferenceType: t.Optional(t.Nullable(t.Union([t.Literal("CDI"), t.Literal("SELIC")]))),
};
const SharedProperties = {
	effectiveDate: t.String(),
	yieldPeriod: t.Optional(t.Nullable(t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")]))),
	yieldTaxIds: t.Optional(
		t.Nullable(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20, uniqueItems: true })),
	),
	yieldTaxRate: t.Optional(t.Nullable(t.Number({ maximum: 100, minimum: 0 }))),
};

export const HistoricalYieldSettingsDTO = t.Object({
	settings: t.Union([
		// A malformed tiered policy must not validate through the flat-rate branch.
		t.Object(
			{ ...SharedProperties, ...RateProperties, financialAccountId: t.Optional(t.String()) },
			{ additionalProperties: false },
		),
		t.Object({
			...SharedProperties,
			countryCode: t.Optional(t.Nullable(t.String())),
			currency: t.Optional(t.String()),
			effectiveUntil: t.Optional(t.Nullable(t.String())),
			profileId: t.Optional(t.Nullable(t.String())),
			rules: t.Array(
				t.Object({ ...RateProperties, upToBalance: t.Optional(t.Nullable(t.Number({ minimum: 0 }))) }),
				{ maxItems: 100, minItems: 1 },
			),
			status: t.Optional(t.Union([t.Literal("APPROVED"), t.Literal("PENDING"), t.Literal("REJECTED")])),
		}),
	]),
	throughDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
});
export type HistoricalYieldSettingsDTO = typeof HistoricalYieldSettingsDTO.static;
