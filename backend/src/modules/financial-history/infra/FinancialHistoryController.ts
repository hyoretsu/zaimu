import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { supportedCurrencies } from "~/modules/currencies/application/currency-catalog";
import { currencyRateDate } from "~/modules/currencies/application/currency-exchange";
import { ensureCurrencyRates, getLatestCurrencyRate } from "~/modules/currencies/infra/currency-exchange";
import { requireAdmin } from "~/modules/taxes/admin-access";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { getCurrencyHistoryEstimate } from "../application/currency-history-estimate";
import { getFinancialCoverage } from "../application/financial-coverage";
import {
	getHistoryCollection,
	requestHistoryCollection,
	retryHistoryCollection,
} from "../application/history-collections";
import { getHistoryCoverage } from "../application/history-coverage";
import { FinancialCoverageQuery, FinancialCoverageReturn } from "./financial-coverage.dto";
import { HistoryCoverageReturn } from "./history-coverage.dto";

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
async function validateHistorySeries(kind: "CURRENCY" | "INTEREST" | undefined, series: string) {
	if (!kind) throw new HttpException("Selecione o tipo da série", 400);
	const supported = kind === "INTEREST" ? ["CDI", "SELIC"] : await supportedCurrencies();
	if (!supported.includes(series)) throw new HttpException("Série não suportada", 400);
}

export const FinancialHistoryController = new Elysia({ prefix: "/financial-history" })
	.get(
		"/coverage",
		async ({ request, query }) => {
			const userId = await requireUserId(request);
			const [user] = await queryRaw<{ role: string }>(`SELECT "role" FROM "user" WHERE "id"=$1`, [userId]);
			return getFinancialCoverage(userId, user?.role === "ADMIN", query.startDate, query.endDate);
		},
		{
			detail: { operationId: "getFinancialHistoryCoverage" },
			query: FinancialCoverageQuery,
			response: FinancialCoverageReturn,
		},
	)
	.get(
		"/admin/coverage",
		async ({ request, query }) => {
			await requireAdmin(request);
			if (query.series) await validateHistorySeries(query.kind, query.series);
			return getHistoryCoverage(query.startDate, query.endDate, query.kind, query.series);
		},
		{
			detail: { operationId: "getFinancialHistoryAdminCoverage" },
			query: t.Object({
				endDate: t.Optional(t.String({ format: "date" })),
				kind: t.Optional(t.Union([t.Literal("CURRENCY"), t.Literal("INTEREST")])),
				series: t.Optional(t.String()),
				startDate: t.Optional(t.String({ format: "date" })),
			}),
			response: HistoryCoverageReturn,
		},
	)
	.post(
		"/admin/coverage/complete",
		async ({ request, body }) => {
			await requireAdmin(request);
			await validateHistorySeries(body.kind, body.series);
			try {
				const collection = await requestHistoryCollection(
					body.kind,
					[body.series],
					undefined,
					undefined,
					body,
				);
				return collection ? retryHistoryCollection(collection.id) : null;
			} catch (error) {
				if (error instanceof RangeError) throw new HttpException(error.message, 400);
				throw error;
			}
		},
		{
			body: t.Object({
				endDate: t.String({ format: "date" }),
				kind: t.Union([t.Literal("CURRENCY"), t.Literal("INTEREST")]),
				series: t.String(),
				startDate: t.String({ format: "date" }),
			}),
			detail: { operationId: "postFinancialHistoryAdminCoverageComplete" },
			response: t.Nullable(HistoryCollectionReturn),
		},
	)
	.get("/currencies", () => supportedCurrencies(), {
		detail: { operationId: "getFinancialHistoryCurrencies" },
		response: t.Array(t.String()),
	})
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
			detail: { operationId: "getFinancialHistoryRate" },
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
			detail: { operationId: "postFinancialHistoryCollections" },
			response: t.Nullable(HistoryCollectionReturn),
		},
	)
	.get(
		"/collections/:id/estimate",
		({ params, query }) => getCurrencyHistoryEstimate(params.id, query.currency),
		{
			detail: { operationId: "getFinancialHistoryCollectionsByIdEstimate" },
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
		detail: { operationId: "getFinancialHistoryCollectionsById" },
		params: t.Object({ id: t.String({ format: "uuid" }) }),
		response: t.Nullable(HistoryCollectionReturn),
	})
	.post("/collections/:id/retry", ({ params }) => retryHistoryCollection(params.id), {
		detail: { operationId: "postFinancialHistoryCollectionsByIdRetry" },
		params: t.Object({ id: t.String({ format: "uuid" }) }),
		response: t.Nullable(HistoryCollectionReturn),
	});
