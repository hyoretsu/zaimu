import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { queryRaw } from "~/shared/infra/sql";
import { supportedCurrencies } from "../application/currency-catalog";

const CurrencyPreferenceReturn = t.Object({ preferredCurrency: t.Nullable(t.String()) });
export const CurrencyPreferencesController = new Elysia({ prefix: "/currency-preferences" })
	.get(
		"/",
		async ({ request }) => {
			const userId = await requireUserId(request);
			const [user] = await queryRaw<{ preferredCurrency: string | null }>(
				'SELECT "preferredCurrency" FROM "user" WHERE "id"=$1',
				[userId],
			);
			if (!user) throw new Error("Usuário indisponível");
			return user;
		},
		{ response: CurrencyPreferenceReturn },
	)
	.patch(
		"/",
		async ({ request, body }) => {
			const userId = await requireUserId(request);
			const preferredCurrency = body.preferredCurrency?.toUpperCase() ?? null;
			if (preferredCurrency && !(await supportedCurrencies()).includes(preferredCurrency))
				throw new RangeError("Moeda não suportada");
			const [user] = await queryRaw<{ preferredCurrency: string | null }>(
				'UPDATE "user" SET "preferredCurrency"=$2 WHERE "id"=$1 RETURNING "preferredCurrency"',
				[userId, preferredCurrency],
			);
			if (!user) throw new Error("Usuário indisponível");
			return user;
		},
		{
			body: t.Object({ preferredCurrency: t.Nullable(t.String({ pattern: "^[A-Za-z]{3}$" })) }),
			response: CurrencyPreferenceReturn,
		},
	);
