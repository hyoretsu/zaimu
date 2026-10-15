import { t } from "elysia";

export const InstitutionNameBody = t.Object(
	{ name: t.String({ maxLength: 100, minLength: 1 }) },
	{ additionalProperties: false },
);
export type InstitutionNameBody = typeof InstitutionNameBody.static;
