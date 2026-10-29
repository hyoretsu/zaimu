import { withProviderSlot } from "~/modules/financial-history/application/provider-slots";
import { queryRaw } from "~/shared/infra/sql";
import { createCurrencyExchangeService, type CurrencyRates } from "../application/currency-exchange";
import { storedCurrencyFactors } from "../application/stored-currency-factors";

const exchange = createCurrencyExchangeService(
	{
		async find(date, baseCurrency) {
			const [record] = await queryRaw<{ rates: CurrencyRates }>(
				'SELECT "rates" FROM "CurrencyRateSnapshot" WHERE "date" = $1::date AND "baseCurrency" = $2',
				[date, baseCurrency],
			);
			return record?.rates ?? null;
		},
		async latest(baseCurrency) {
			const [record] = await queryRaw<{ date: string; rates: CurrencyRates }>(
				`SELECT to_char("date",'YYYY-MM-DD') AS "date", "rates" FROM "CurrencyRateSnapshot" WHERE "baseCurrency"=$1 ORDER BY "date" DESC LIMIT 1`,
				[baseCurrency],
			);
			return record ?? null;
		},
		async save(date, baseCurrency, rates) {
			const [record] = await queryRaw<{ rates: CurrencyRates }>(
				`INSERT INTO "CurrencyRateSnapshot" ("date", "baseCurrency", "rates") VALUES ($1::date, $2, $3::jsonb)
			ON CONFLICT ("date", "baseCurrency") DO UPDATE SET "baseCurrency" = EXCLUDED."baseCurrency" RETURNING "rates"`,
				[date, baseCurrency, JSON.stringify(rates)],
			);
			if (!record) throw new Error("Não foi possível armazenar cotação.");
			return record.rates;
		},
	},
	fetch,
	operation => withProviderSlot("currency-api", 6, operation),
);

export const ensureCurrencyRates = exchange.ensure;
export const getCurrencyRate = exchange.ensure;
export const convertCurrencyAmount = exchange.convert;

export const getLatestCurrencyRate = exchange.latest;

/** One read for all requested date/base pairs; missing snapshots retain the provider path. */
export function getStoredCurrencyFactors(
	requests: readonly { date: string; source: string }[],
	target: string,
) {
	return storedCurrencyFactors(requests, target, keys =>
		queryRaw<{ date: string; baseCurrency: string; rates: CurrencyRates }>(
			`SELECT snapshot."date"::text AS date,snapshot."baseCurrency",snapshot."rates"
         FROM "CurrencyRateSnapshot" snapshot
         JOIN jsonb_to_recordset($1::jsonb) AS requested(date date,"baseCurrency" text)
           ON snapshot."date"=requested.date AND snapshot."baseCurrency"=requested."baseCurrency"`,
			[JSON.stringify(keys)],
		),
	);
}
