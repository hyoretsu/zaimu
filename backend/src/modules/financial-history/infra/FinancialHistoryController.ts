import { fetchCurrencyCatalog } from "@zaimu/finance/currency-provider";
import Elysia, { t } from "elysia";
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
let catalog: { currencies: string[]; expiresAt: number } | undefined;
let pendingCatalog: Promise<string[]> | undefined;
async function supportedCurrencies() {
	if (catalog && catalog.expiresAt > Date.now()) return catalog.currencies;
	pendingCatalog ??= fetchCurrencyCatalog()
		.then(currencies => {
			catalog = { currencies, expiresAt: Date.now() + 86_400_000 };
			return currencies;
		})
		.finally(() => {
			pendingCatalog = undefined;
		});
	return pendingCatalog;
}

export const FinancialHistoryController = new Elysia({ prefix: "/financial-history" })
	.get("/currencies", () => supportedCurrencies(), { response: t.Array(t.String()) })
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
