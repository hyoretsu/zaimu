import { t } from "elysia";

const Positive = t.Number({ exclusiveMinimum: 0 });
export const InstitutionCardRulesDTO = t.Object({
	cashback: t.Nullable(
		t.Object({
			conversionAmount: t.Nullable(Positive),
			conversionPoints: t.Nullable(Positive),
			kind: t.Union([t.Literal("CASHBACK"), t.Literal("POINTS")]),
			rate: Positive,
			yieldPeriod: t.Nullable(t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")])),
			yieldReferencePercentage: t.Nullable(Positive),
			yieldReferenceRate: t.Nullable(Positive),
		}),
	),
	workingDueDate: t.Boolean(),
});
export type InstitutionCardRulesDTO = typeof InstitutionCardRulesDTO.static;
