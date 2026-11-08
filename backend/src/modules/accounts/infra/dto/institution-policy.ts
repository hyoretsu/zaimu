import { t } from "elysia";
import { YieldAccountTypeDTO } from "~/shared/infra/elysia/transport-contracts";

const Id = t.String({ maxLength: 36, minLength: 1 });
const DateDTO = t.String({ format: "date" });

/** One yield policy period of an institution profile; also the body of `POST /:id/policies`. */
export const InstitutionPolicyBody = t.Object({
	accountType: t.Optional(YieldAccountTypeDTO),
	countryCode: t.Optional(t.String({ maxLength: 2, minLength: 2 })),
	effectiveDate: DateDTO,
	effectiveUntil: t.Optional(DateDTO),
	profileId: Id,
	replacesEffectiveDate: t.Optional(DateDTO),
	rules: t.Array(
		t.Object({
			upToBalance: t.Nullable(t.Number({ exclusiveMinimum: 0 })),
			yieldFixedRate: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
			yieldReferencePercentage: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
			yieldReferenceType: t.Optional(
				t.Nullable(
					t.Union([t.Literal("CDI"), t.Literal("SELIC"), t.Literal("IPCA"), t.Literal("TR")]),
				),
			),
		}),
		{ maxItems: 20 },
	),
	yieldPeriod: t.Optional(t.Nullable(t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")]))),
	yieldTaxIds: t.Optional(t.Array(Id)),
	yieldTaxMode: t.Optional(t.Nullable(t.Union([t.Literal("DAILY"), t.Literal("ON_REDEMPTION")]))),
	yieldTaxModes: t.Optional(
		t.Nullable(
			t.Record(t.String({ maxLength: 36 }), t.Union([t.Literal("DAILY"), t.Literal("ON_REDEMPTION")])),
		),
	),
	yieldTaxRate: t.Optional(t.Nullable(t.Number({ maximum: 100, minimum: 0 }))),
});
export type InstitutionPolicyBody = typeof InstitutionPolicyBody.static;

/** A policy inside a composite proposal: targets an existing profile by id or a profile created in the same payload by name. */
export const InstitutionPolicyProposal = t.Object({
	...InstitutionPolicyBody.properties,
	profileId: t.Optional(Id),
	profileName: t.Optional(t.String({ maxLength: 100, minLength: 1, pattern: "\\S" })),
});
export type InstitutionPolicyProposal = typeof InstitutionPolicyProposal.static;
