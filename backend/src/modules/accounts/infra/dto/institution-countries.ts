import { t } from "elysia";

export const InstitutionCountriesBody = t.Object({
	accountCurrenciesByCountry: t.Record(
		t.String({ pattern: "^[A-Z]{2}$" }),
		t.Array(t.String({ pattern: "^[A-Z]{3}$" }), { minItems: 1, uniqueItems: true }),
		{ additionalProperties: false },
	),
	creditStatementClosingInclusive: t.Optional(t.Boolean()),
	name: t.Optional(t.String({ maxLength: 100, minLength: 1, pattern: "\\S" })),
});
export type InstitutionCountriesBody = typeof InstitutionCountriesBody.static;
