import { countryTimeZone, isTimeZone, resolveTimeZone } from "@zaimu/finance/time-zone";
import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { db, queryRows } from "~/shared/infra/sql";
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
			const userId = await requireUserId(request);
			const [user] = await queryRows(
				db.sql.public.user
					.select("preferredCountry")
					.where((fields, functions) => functions.eq(fields.id, userId))
					.build(),
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
			const userId = await requireUserId(request);
			const [user] = await queryRows(
				db.sql.public.user
					.update({ preferredCountry: body.preferredCountry })
					.where((fields, functions) => functions.eq(fields.id, userId))
					.returning("preferredCountry")
					.build(),
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return user;
		},
		{ body: t.Object({ preferredCountry: Country }), response: PreferenceReturn },
	)
	.get(
		"/time-zone-preferences",
		async ({ request }) => {
			const userId = await requireUserId(request);
			const [user] = await queryRows(
				db.sql.public.user
					.select("preferredCountry", "preferredTimeZone")
					.where((fields, functions) => functions.eq(fields.id, userId))
					.build(),
			);
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
			const userId = await requireUserId(request);
			const [user] = await queryRows(
				db.sql.public.user
					.update({ preferredTimeZone: body.preferredTimeZone, updatedAt: new Date() })
					.where((fields, functions) => functions.eq(fields.id, userId))
					.returning("preferredCountry", "preferredTimeZone")
					.build(),
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return presentTimeZonePreference(user);
		},
		{
			body: t.Object({ preferredTimeZone: t.Nullable(t.String({ maxLength: 100, minLength: 1 })) }),
			response: TimeZonePreferenceReturn,
		},
	);
