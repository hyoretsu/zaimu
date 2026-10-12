import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { supportedCountryCodes } from "./calendar-source";

const Country = t.String({ pattern: "^[A-Z]{2}$" });
const PreferenceReturn = t.Object({ preferredCountry: t.Nullable(Country) });
export const CountryPreferencesController = new Elysia()
	.get("/countries", () => ({ countries: supportedCountryCodes }), {
		response: t.Object({ countries: t.Array(Country) }),
	})
	.get(
		"/country-preferences",
		async ({ request }) => {
			const [user] = await queryRaw<{ preferredCountry: string | null }>(
				`SELECT "preferredCountry" FROM "user" WHERE "id"=$1`,
				[await requireUserId(request)],
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return user;
		},
		{ response: PreferenceReturn },
	)
	.patch(
		"/country-preferences",
		async ({ request, body }) => {
			if (!supportedCountryCodes.includes(body.preferredCountry))
				throw new HttpException("País inválido", 400);
			const [user] = await queryRaw<{ preferredCountry: string | null }>(
				`UPDATE "user" SET "preferredCountry"=CASE WHEN $3 THEN COALESCE("preferredCountry",$2) ELSE $2 END WHERE "id"=$1 RETURNING "preferredCountry"`,
				[
					await requireUserId(request),
					body.preferredCountry,
					request.headers.get("X-Country-Initialize") === "true",
				],
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return user;
		},
		{ body: t.Object({ preferredCountry: Country }), response: PreferenceReturn },
	);
