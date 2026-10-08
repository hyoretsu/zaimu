import Elysia, { t } from "elysia";
import { supportedCurrencies } from "~/modules/currencies/application/currency-catalog";
import { currencyRateDate } from "~/modules/currencies/application/currency-exchange";
import { ensureCurrencyRates, getLatestCurrencyRate } from "~/modules/currencies/infra/currency-exchange";
import { HttpException } from "~/shared/errors";
import { getCurrencyHistoryEstimate } from "../application/currency-history-estimate";
import {
	getHistoryCollection,
	requestHistoryCollection,
	retryHistoryCollection,
} from "../application/history-collections";

const HistoryUnitReturn = t.Object(
	{
		attempts: t.Number(),
		endDate: t.String(),
		generation: t.Number(),
		id: t.String(),
		kind: t.Union([t.Literal("CURRENCY"), t.Literal("INTEREST")]),
		lastError: t.Nullable(t.String()),
		series: t.String(),
		startDate: t.String(),
		state: t.String(),
		updatedAt: t.String(),
	},
	{ additionalProperties: true },
);
export const HistoryProgressReturn = t.Object({
	canRetry: t.Boolean(),
	completed: t.Number(),
	coveredDays: t.Number(),
	failed: t.Number(),
	lastActivity: t.Nullable(t.String()),
	pending: t.Number(),
	requestedDays: t.Number(),
	running: t.Number(),
	state: t.String(),
	total: t.Number(),
	unavailable: t.Number(),
});
const HistoryCollectionReturn = t.Object({
	endDate: t.String(),
	id: t.String(),
	kind: t.String(),
	progress: HistoryProgressReturn,
	series: t.Array(t.String()),
	startDate: t.String(),
	units: t.Array(HistoryUnitReturn),
});
export const FinancialHistoryController = new Elysia({ prefix: "/financial-history" })
	.get("/currencies", () => supportedCurrencies(), { response: t.Array(t.String()) })
	.get(
		"/rate",
		async ({ query }) => {
			const date = query.date === "latest" ? "latest" : currencyRateDate(query.date);
			if (date !== "latest" && date > new Date().toISOString().slice(0, 10))
				throw new HttpException("Conversão diária não aceita datas futuras", 400);
			const currencies = await supportedCurrencies();
			if (!currencies.includes(query.from) || !currencies.includes(query.to))
				throw new HttpException("Moeda não suportada", 400);
			if (date === "latest") {
				const latest = await getLatestCurrencyRate(query.from, query.to);
				return { ...latest, from: query.from, to: query.to };
			}
			return {
				date,
				from: query.from,
				rate: await ensureCurrencyRates(date, query.from, query.to),
				to: query.to,
			};
		},
		{
			query: t.Object({
				date: t.Union([t.Literal("latest"), t.String({ format: "date" })]),
				from: t.String({ pattern: "^[A-Z]{3}$" }),
				to: t.String({ pattern: "^[A-Z]{3}$" }),
			}),
			response: t.Object({ date: t.String(), from: t.String(), rate: t.Number(), to: t.String() }),
		},
	)
	.post(
		"/collections",
		async ({ body }) => {
			if (body.kind === "CURRENCY") {
				const currencies = await supportedCurrencies();
				if (body.series.some(series => !currencies.includes(series.toUpperCase())))
					throw new RangeError("Moeda não suportada");
			}
			return requestHistoryCollection(body.kind, body.series, body.referenceDate);
		},
		{
			body: t.Object({
				kind: t.Union([t.Literal("CURRENCY"), t.Literal("INTEREST")]),
				referenceDate: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
				series: t.Array(t.String(), { maxItems: 20, minItems: 1 }),
			}),
			response: t.Nullable(HistoryCollectionReturn),
		},
	)
	.get(
		"/collections/:id/estimate",
		({ params, query }) => getCurrencyHistoryEstimate(params.id, query.currency),
		{
			params: t.Object({ id: t.String({ format: "uuid" }) }),
			query: t.Object({ currency: t.String({ pattern: "^[A-Z]{3}$" }) }),
			response: t.Nullable(
				t.Object({
					collectionId: t.String(),
					currency: t.String(),
					endDate: t.String(),
					estimates: t.Array(
						t.Object({
							baseCurrency: t.String(),
							firstDate: t.Nullable(t.String()),
							lastDate: t.Nullable(t.String()),
							rate: t.Nullable(t.Number()),
							samples: t.Number(),
						}),
					),
					method: t.Literal("EXPONENTIAL_90_DAY_HALF_LIFE"),
					progress: HistoryProgressReturn,
					startDate: t.String(),
				}),
			),
		},
	)
	.get("/collections/:id", ({ params }) => getHistoryCollection(params.id), {
		params: t.Object({ id: t.String({ format: "uuid" }) }),
		response: t.Nullable(HistoryCollectionReturn),
	})
	.post("/collections/:id/retry", ({ params }) => retryHistoryCollection(params.id), {
		params: t.Object({ id: t.String({ format: "uuid" }) }),
		response: t.Nullable(HistoryCollectionReturn),
	});
