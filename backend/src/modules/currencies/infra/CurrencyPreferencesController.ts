import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { db, queryFirst, queryRaw } from "~/shared/infra/sql";
import { supportedCurrencies } from "../application/currency-catalog";

const CurrencyPreferenceReturn = t.Object({ preferredCurrency: t.Nullable(t.String()) });
export const CurrencyPreferencesController = new Elysia({ prefix: "/currency-preferences" })
	.get(
		"/",
		async ({ request }) => {
			const userId = await requireUserId(request);
			const user = await queryFirst(
				db.sql.public.user
					.select("preferredCurrency")
					.where((fields, functions) => functions.eq(fields.id, userId))
					.limit(1)
					.build(),
			);
			if (!user) throw new Error("Usuário indisponível");
			return user;
		},
		{ detail: { operationId: "getCurrencyPreferences" }, response: CurrencyPreferenceReturn },
	)
	.patch(
		"/",
		async ({ request, body }) => {
			const userId = await requireUserId(request);
			const preferredCurrency = body.preferredCurrency?.toUpperCase() ?? null;
			if (preferredCurrency !== null && !(await supportedCurrencies()).includes(preferredCurrency))
				throw new RangeError("Moeda não suportada");
			const initialize = request.headers.get("X-Currency-Initialize") === "true";
			const [user] = await queryRaw<{ preferredCurrency: string | null }>(
				'UPDATE "user" SET "preferredCurrency"=CASE WHEN $3 THEN COALESCE("preferredCurrency", $2) ELSE $2 END WHERE "id"=$1 RETURNING "preferredCurrency"',
				[userId, preferredCurrency, initialize],
			);
			if (!user) throw new Error("Usuário indisponível");
			return user;
		},
		{
			body: t.Object({ preferredCurrency: t.Nullable(t.String({ pattern: "^[A-Za-z]{3}$" })) }),
			detail: { operationId: "patchCurrencyPreferences" },
			response: CurrencyPreferenceReturn,
		},
	);
