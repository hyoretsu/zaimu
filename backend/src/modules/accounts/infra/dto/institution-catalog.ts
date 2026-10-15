import { t } from "elysia";

export const InstitutionCatalogResult = t.Object(
	{
		accountCurrenciesByCountry: t.Record(t.String(), t.Array(t.String())),
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
