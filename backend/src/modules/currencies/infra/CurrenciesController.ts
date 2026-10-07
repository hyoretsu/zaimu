import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { currencyRateDate, normalizeCurrency } from "../application/currency-exchange";
import { getCurrencyRate } from "./currency-exchange";

export const CurrenciesController = new Elysia({ prefix: "/currencies" }).get(
	"/rates",
	async ({ query, request }) => {
		await requireUserId(request);
		const date = currencyRateDate(query.date);
		const from = normalizeCurrency(query.from);
		const to = normalizeCurrency(query.to);
		return { date, from, rate: await getCurrencyRate(date, from, to), to };
	},
	{
		query: t.Object({
			date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
			from: t.String({ maxLength: 3, minLength: 3 }),
			to: t.String({ maxLength: 3, minLength: 3 }),
		}),
		response: t.Object({ date: t.String(), from: t.String(), rate: t.Number(), to: t.String() }),
	},
);
