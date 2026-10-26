import { countryTimeZone, isTimeZone, resolveTimeZone } from "@zaimu/finance/time-zone";
import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { supportedCountryCodes } from "./calendar-source";

const Country = t.String({ pattern: "^[A-Z]{2}$" });
const PreferenceReturn = t.Object({ preferredCountry: t.Nullable(Country) });
const TimeZonePreferenceReturn = t.Object({
	defaultTimeZone: t.String(),
	preferredCountry: t.Nullable(Country),
	preferredTimeZone: t.Nullable(t.String()),
	timeZone: t.String(),
});
function presentTimeZonePreference(user: {
	preferredCountry: string | null;
	preferredTimeZone: string | null;
}) {
	return {
		...user,
		defaultTimeZone: countryTimeZone(user.preferredCountry),
		timeZone: resolveTimeZone(user.preferredTimeZone, user.preferredCountry),
	};
}
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
	)
	.get(
		"/time-zone-preferences",
		async ({ request }) => {
			const [user] = await queryRaw<{
				preferredCountry: string | null;
				preferredTimeZone: string | null;
			}>('SELECT "preferredCountry","preferredTimeZone" FROM "user" WHERE "id"=$1', [
				await requireUserId(request),
			]);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return presentTimeZonePreference(user);
		},
		{ response: TimeZonePreferenceReturn },
	)
	.patch(
		"/time-zone-preferences",
		async ({ request, body }) => {
			if (body.preferredTimeZone !== null && !isTimeZone(body.preferredTimeZone))
				throw new HttpException("Fuso horário inválido", 400);
			const [user] = await queryRaw<{
				preferredCountry: string | null;
				preferredTimeZone: string | null;
			}>(
				'UPDATE "user" SET "preferredTimeZone"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 RETURNING "preferredCountry","preferredTimeZone"',
				[await requireUserId(request), body.preferredTimeZone],
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return presentTimeZonePreference(user);
		},
		{
			body: t.Object({ preferredTimeZone: t.Nullable(t.String({ maxLength: 100, minLength: 1 })) }),
			response: TimeZonePreferenceReturn,
		},
	);
