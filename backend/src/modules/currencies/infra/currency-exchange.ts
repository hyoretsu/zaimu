import { queryRaw } from "~/shared/infra/sql";
import { type CurrencyRates, createCurrencyExchangeService } from "../application/currency-exchange";

const exchange = createCurrencyExchangeService({
	async find(date, baseCurrency) {
		const [record] = await queryRaw<{ rates: CurrencyRates }>(
			'SELECT "rates" FROM "CurrencyRateSnapshot" WHERE "date" = $1::date AND "baseCurrency" = $2',
			[date, baseCurrency],
		);
		return record?.rates ?? null;
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
});

export const ensureCurrencyRates = exchange.ensure;
export const getCurrencyRate = exchange.ensure;
export const convertCurrencyAmount = exchange.convert;
