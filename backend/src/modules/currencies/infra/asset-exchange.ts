import "@zaimu/finance/crypto-assets";
import { unitsToDecimal } from "@zaimu/finance/asset-amount";
import { type AssetQuote, createBrapiAssetQuoteProvider } from "@zaimu/finance/asset-quote-provider";
import { currencyDigits, isCryptoAsset, normalizeCurrency } from "@zaimu/finance/money";
import { withProviderSlot } from "~/modules/financial-history/application/provider-slots";
import { queryRaw } from "~/shared/infra/sql";
import { createAssetQuoteService } from "../application/asset-quotes";
import { createCoinbaseAssetQuoteProvider } from "../application/coinbase-quotes";
import { currencyRateDate } from "../application/currency-exchange";
import { getCurrencyRate } from "./currency-exchange";

export const getAssetQuote = createAssetQuoteService({
	async identity(assetCode) {
		const [asset] = await queryRaw<{ quoteProvider: string | null }>(
			'SELECT "quoteProvider" FROM "Asset" WHERE "code"=$1 AND "kind"=\'CRYPTO\'',
			[assetCode],
		);
		return asset?.quoteProvider ?? null;
	},
	provider(identity) {
		if (identity.startsWith("coinbase:")) {
			const client = createCoinbaseAssetQuoteProvider();
			return {
				assetId: identity.slice(9),
				client: {
					fetchQuotes: (date, codes, currency) =>
						withProviderSlot("coinbase", 6, () => client.fetchQuotes(date, codes, currency)),
				},
			};
		}
		const match = /^brapi:([A-Z0-9]{2,12})$/.exec(identity);
		const token = process.env.BRAPI_TOKEN;
		if (!match || !token) return null;
		const client = createBrapiAssetQuoteProvider({ token });
		return {
			assetId: match[1],
			client: {
				fetchQuotes: (date, codes, currency) =>
					withProviderSlot("brapi", 6, () => client.fetchQuotes(date, codes, currency)),
			},
		};
	},
	store: {
		async find(date, assetCode, currency, provider) {
			const [quote] = await queryRaw<AssetQuote & Record<string, unknown>>(
				`SELECT "assetCode","quoteCurrency","price"::text AS price,to_char("date",'YYYY-MM-DD') AS date,to_char("sourceTime",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "sourceTime" FROM "AssetQuoteSnapshot" WHERE "date"=$1::date AND "assetCode"=$2 AND "quoteCurrency"=$3 AND "provider"=$4`,
				[date, assetCode, currency, provider],
			);
			return quote ?? null;
		},
		async save(quote, provider) {
			await queryRaw(
				`INSERT INTO "AssetQuoteSnapshot" ("id","assetCode","quoteCurrency","date","price","sourceTime","provider","createdAt") VALUES ($1,$2,$3,$4::date,$5::numeric,$6::timestamp,$7,now()) ON CONFLICT ("assetCode","quoteCurrency","date","provider") DO NOTHING`,
				[
					crypto.randomUUID(),
					quote.assetCode,
					quote.quoteCurrency,
					quote.date,
					quote.price,
					quote.sourceTime,
					provider,
				],
			);
			const stored = await this.find(quote.date, quote.assetCode, quote.quoteCurrency, provider);
			if (!stored) throw new Error("Não foi possível armazenar cotação do ativo.");
			return stored;
		},
	},
});

function fraction(value: string): { units: bigint; scale: bigint } {
	const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
	if (!match) throw new RangeError("Taxa decimal inválida");
	const decimal = match[2] ?? "";
	const exponent = Number(match[3] ?? 0);
	if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000)
		throw new RangeError("Taxa fora da precisão suportada");
	let units = BigInt(match[1] + decimal);
	const digits = decimal.length - exponent;
	if (digits < 0) units *= 10n ** BigInt(-digits);
	if (units <= 0n) throw new RangeError("Taxa deve ser positiva");
	return { scale: 10n ** BigInt(Math.max(0, digits)), units };
}

/** Historical conversion with exact quantities and one final half-away-from-zero rounding. */
export async function convertAssetAmount(
	amount: string,
	fromInput: string,
	toInput: string,
	dateInput: string | Date,
): Promise<string> {
	const from = normalizeCurrency(fromInput),
		to = normalizeCurrency(toInput);
	const date = currencyRateDate(dateInput);
	if (!/^-?\d+(?:\.\d{1,18})?$/.test(amount)) throw new RangeError("Valor decimal inválido");
	const [integer, decimals = ""] = amount.replace("-", "").split(".");
	let numerator = BigInt(integer + decimals) * (amount.startsWith("-") ? -1n : 1n);
	let denominator = 10n ** BigInt(decimals.length);
	const sourceCrypto = isCryptoAsset(from),
		targetCrypto = isCryptoAsset(to);
	const sourceFiat = sourceCrypto ? "USD" : from;
	const targetFiat = targetCrypto ? "USD" : to;
	if (sourceCrypto && from !== to) {
		const price = fraction((await getAssetQuote(date, from, "USD")).price);
		numerator *= price.units;
		denominator *= price.scale;
	}
	if (sourceFiat !== targetFiat) {
		// Legacy fiat snapshots store JSON numbers; exactness starts at their decimal representation.
		const rate = fraction(String(await getCurrencyRate(date, sourceFiat, targetFiat)));
		numerator *= rate.units;
		denominator *= rate.scale;
	}
	if (targetCrypto && from !== to) {
		const price = fraction((await getAssetQuote(date, to, "USD")).price);
		numerator *= price.scale;
		denominator *= price.units;
	}
	numerator *= 10n ** BigInt(currencyDigits(to));
	const negative = numerator < 0n;
	const absolute = negative ? -numerator : numerator;
	const rounded = absolute / denominator + ((absolute % denominator) * 2n >= denominator ? 1n : 0n);
	return unitsToDecimal(negative ? -rounded : rounded, to);
}
