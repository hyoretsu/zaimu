import { t } from "elysia";
import { InstitutionCardRulesDTO } from "./institution-card-rules";

export const InstitutionCatalogResult = t.Object(
	{
		accountCurrenciesByCountry: t.Record(t.String(), t.Array(t.String())),
		cardRulesProfiles: t.Optional(
			t.Array(
				t.Object({
					creditCardRules: t.Nullable(InstitutionCardRulesDTO),
					id: t.String(),
					isDefault: t.Boolean(),
				}),
			),
		),
		creditCardRules: t.Nullable(InstitutionCardRulesDTO),
		creditInstallmentRemainderOnFirst: t.Boolean(),
		creditStatementClosingInclusive: t.Boolean(),
		currency: t.String(),
		id: t.String(),
		name: t.String(),
		operatingCountryCodes: t.Array(t.String()),
		status: t.String(),
		version: t.Number(),
	},
	{ additionalProperties: true },
);
export type InstitutionCatalogResult = typeof InstitutionCatalogResult.static;
