import { t } from "elysia";

export const InstitutionCountriesBody = t.Object({
	creditStatementClosingInclusive: t.Optional(t.Boolean()),
	name: t.Optional(t.String({ maxLength: 100, minLength: 1, pattern: "\\S" })),
	operatingCountryCodes: t.Array(t.String({ pattern: "^[A-Z]{2}$" }), { uniqueItems: true }),
});
export type InstitutionCountriesBody = typeof InstitutionCountriesBody.static;
