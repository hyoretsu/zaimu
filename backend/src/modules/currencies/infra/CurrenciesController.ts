import { cryptoAssets } from "@zaimu/finance/crypto-assets";
import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { supportedCurrencies } from "../application/currency-catalog";
import { currencyRateDate, normalizeCurrency } from "../application/currency-exchange";
import { convertAssetAmount, getAssetQuote } from "./asset-exchange";
import { getCurrencyRate } from "./currency-exchange";

const ConvertAssetReturn = t.Object({
	amount: t.String(),
	date: t.String(),
	from: t.String(),
	to: t.String(),
});

export const CurrenciesController = new Elysia({ prefix: "/currencies" })
	.get(
		"/catalog",
		async () => ({
			assets: cryptoAssets,
			codes: [...new Set([...(await supportedCurrencies()), ...cryptoAssets.map(asset => asset.code)])],
		}),
		{
			detail: { operationId: "getCurrenciesCatalog" },
			response: t.Object({
				assets: t.Array(
					t.Object({
						assetId: t.String(),
						code: t.String(),
						digits: t.Number(),
						name: t.String(),
						nativeDigits: t.Number(),
						provider: t.Literal("coinbase"),
						providerId: t.String(),
						symbol: t.String(),
						type: t.Literal("crypto"),
					}),
				),
				codes: t.Array(t.String()),
			}),
		},
	)
	.get(
		"/asset-quote",
		async ({ query }) => {
			const date = currencyRateDate(query.date);
			if (date > new Date().toISOString().slice(0, 10))
				throw new RangeError("Cotação futura indisponível");
			return getAssetQuote(date, query.assetCode, "USD");
		},
		{
			detail: { operationId: "getCurrenciesAssetQuote" },
			query: t.Object({
				assetCode: t.String({ pattern: "^[A-Za-z0-9]{2,12}$" }),
				date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
			}),
			response: t.Object({
				assetCode: t.String(),
				date: t.String(),
				price: t.String(),
				quoteCurrency: t.String(),
				sourceTime: t.String(),
			}),
		},
	)
	.get(
		"/convert-asset",
		async ({ query, request }) => {
			await requireUserId(request);
			const date = currencyRateDate(query.date),
				from = query.from.toUpperCase(),
				to = query.to.toUpperCase();
			return { amount: await convertAssetAmount(query.amount, from, to, date), date, from, to };
		},
		{
			detail: { operationId: "getCurrenciesConvertAsset" },
			query: t.Object({
				amount: t.String({ maxLength: 60, pattern: "^-?[0-9]+(\\.[0-9]{1,18})?$" }),
				date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
				from: t.String({ pattern: "^[A-Za-z0-9]{2,12}$" }),
				to: t.String({ pattern: "^[A-Za-z0-9]{2,12}$" }),
			}),
			response: ConvertAssetReturn,
		},
	)
	.get(
		"/rates",
		async ({ query, request }) => {
			await requireUserId(request);
			const date = currencyRateDate(query.date);
			const from = normalizeCurrency(query.from);
			const to = normalizeCurrency(query.to);
			return { date, from, rate: await getCurrencyRate(date, from, to), to };
		},
		{
			detail: { operationId: "getCurrenciesRates" },
			query: t.Object({
				date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
				from: t.String({ maxLength: 3, minLength: 3 }),
				to: t.String({ maxLength: 3, minLength: 3 }),
			}),
			response: t.Object({ date: t.String(), from: t.String(), rate: t.Number(), to: t.String() }),
		},
	);
