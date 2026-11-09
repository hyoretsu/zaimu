import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { db, queryRows } from "~/shared/infra/sql";

const Format = t.Union([t.Literal("12h"), t.Literal("24h")]);
const PreferenceReturn = t.Object({ timeFormat: Format });
function presentPreference(user: { timeFormat: string }): typeof PreferenceReturn.static {
	if (user.timeFormat !== "12h" && user.timeFormat !== "24h")
		throw new HttpException("Formato de horário inválido", 500);
	return { timeFormat: user.timeFormat };
}
export const TimeFormatPreferencesController = new Elysia()
	.get(
		"/time-format-preferences",
		async ({ request }) => {
			const userId = await requireUserId(request);
			const [user] = await queryRows(
				db.sql.public.user
					.select("timeFormat")
					.where((fields, functions) => functions.eq(fields.id, userId))
					.build(),
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return presentPreference(user);
		},
		{ response: PreferenceReturn },
	)
	.patch(
		"/time-format-preferences",
		async ({ request, body }) => {
			const userId = await requireUserId(request);
			const [user] = await queryRows(
				db.sql.public.user
					.update({ timeFormat: body.timeFormat })
					.where((fields, functions) => functions.eq(fields.id, userId))
					.returning("timeFormat")
					.build(),
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return presentPreference(user);
		},
		{ body: PreferenceReturn, response: PreferenceReturn },
	);
