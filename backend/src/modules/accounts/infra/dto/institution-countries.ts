import { t } from "elysia";

export const InstitutionCountriesBody = t.Object({
	aliases: t.Optional(
		t.Array(t.String({ maxLength: 100, minLength: 1, pattern: "\\S" }), { maxItems: 10 }),
	),
	creditStatementClosingInclusive: t.Optional(t.Boolean()),
	name: t.Optional(t.String({ maxLength: 100, minLength: 1, pattern: "\\S" })),
	operatingCountryCodes: t.Array(t.String({ pattern: "^[A-Z]{2}$" }), { uniqueItems: true }),
});
export type InstitutionCountriesBody = typeof InstitutionCountriesBody.static;
