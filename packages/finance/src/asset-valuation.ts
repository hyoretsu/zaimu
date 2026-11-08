import { decimalToUnits, unitsToDecimal } from "./asset-amount";
import type { AssetQuote } from "./asset-quote-provider";
import { currencyDigits, isCryptoAsset, normalizeCurrency } from "./money";

export interface AssetQuoteSnapshots {
	getQuote(date: string, assetCode: string, quoteCurrency: string): Promise<AssetQuote | null>;
}

/** One unit of fromCurrency buys rate units of toCurrency. Plain positive decimal text. */
export interface AssetFxRate {
	date: string;
	fromCurrency: string;
	toCurrency: string;
	rate: string;
}

export interface AssetFxSnapshots {
	getRate(date: string, fromCurrency: string, toCurrency: string): Promise<AssetFxRate | null>;
}

export interface AssetValuationInput {
	date: string;
	assetCode: string;
	quantity: string;
	quoteCurrency: string;
	preferredCurrency: string;
}

export interface AssetValuation {
	date: string;
	assetCode: string;
	quantity: string;
	currency: string;
	/** Exact product before fiat rounding, with no intermediate rounding. */
	exactAmount: string;
	/** Preferred fiat amount rounded once to its minor units. */
	amount: string;
	rounding: "HALF_AWAY_FROM_ZERO";
	quote: AssetQuote;
	fx: AssetFxRate | null;
}

export class AssetValuationError extends Error {}

function validDate(date: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(date) &&
		Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
		new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
	);
}

function fiat(code: string): string {
	const normalized = normalizeCurrency(code);
	if (isCryptoAsset(normalized)) throw new AssetValuationError("Moeda fiduciária obrigatória");
	return normalized;
}

/** Price/rate scales are independent of the fiat minor units. No number conversion. */
function positiveDecimal(value: string): { units: bigint; digits: number } {
	if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))
		throw new AssetValuationError("Preço ou taxa decimal inválidos");
	const [integer, fraction = ""] = value.split(".");
	if (fraction.length > 18 || integer.replace(/^0+/, "").length > 20)
		throw new AssetValuationError("Preço ou taxa fora da precisão suportada");
	const units = BigInt(integer + fraction);
	if (units <= 0n) throw new AssetValuationError("Preço ou taxa devem ser positivos");
	return { digits: fraction.length, units };
}

function exactDecimal(units: bigint, digits: number): string {
	const absolute = (units < 0n ? -units : units).toString().padStart(digits + 1, "0");
	const integer = absolute.slice(0, absolute.length - digits);
	const fraction = digits ? absolute.slice(-digits).replace(/0+$/, "") : "";
	return `${units < 0n ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

function roundedFiat(units: bigint, digits: number, currency: string): string {
	const targetDigits = currencyDigits(currency);
	if (digits <= targetDigits) return unitsToDecimal(units * 10n ** BigInt(targetDigits - digits), currency);
	const divisor = 10n ** BigInt(digits - targetDigits);
	const absolute = units < 0n ? -units : units;
	const rounded = absolute / divisor + ((absolute % divisor) * 2n >= divisor ? 1n : 0n);
	return unitsToDecimal(units < 0n ? -rounded : rounded, currency);
}

/** Pure snapshot resolution: exact date/pair only, no provider, persistence or fallback.
 * Exactness starts at the supplied strings, not upstream JSON number tokens.
 */
export function createAssetValuationResolver({
	quotes,
	fx,
}: {
	quotes: AssetQuoteSnapshots;
	fx: AssetFxSnapshots;
}) {
	return async (input: AssetValuationInput): Promise<AssetValuation> => {
		if (!validDate(input.date)) throw new AssetValuationError("Data de valoração inválida");
		const assetCode = normalizeCurrency(input.assetCode);
		if (!isCryptoAsset(assetCode)) throw new AssetValuationError("Ativo cripto obrigatório");
		const quoteCurrency = fiat(input.quoteCurrency);
		const currency = fiat(input.preferredCurrency);
		if (typeof input.quantity !== "string")
			throw new AssetValuationError("Quantidade decimal string obrigatória");
		const quantity = decimalToUnits(input.quantity, assetCode);
		const quantityDigits = currencyDigits(assetCode);
		const quantityText = unitsToDecimal(quantity, assetCode);
		const quote = await quotes.getQuote(input.date, assetCode, quoteCurrency);
		if (
			!quote ||
			quote.date !== input.date ||
			quote.assetCode !== assetCode ||
			quote.quoteCurrency !== quoteCurrency
		)
			throw new AssetValuationError("Cotação ausente ou incompatível com a data e o par solicitados");
		if (
			typeof quote.sourceTime !== "string" ||
			!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(quote.sourceTime) ||
			!Number.isFinite(Date.parse(quote.sourceTime)) ||
			new Date(quote.sourceTime).toISOString().slice(0, 10) !== input.date
		)
			throw new AssetValuationError("Horário de origem incompatível com a data solicitada");
		const price = positiveDecimal(quote.price);
		let units = quantity * price.units;
		let digits = quantityDigits + price.digits;
		let rateSnapshot: AssetFxRate | null = null;
		if (quoteCurrency !== currency) {
			rateSnapshot = await fx.getRate(input.date, quoteCurrency, currency);
			if (
				!rateSnapshot ||
				rateSnapshot.date !== input.date ||
				rateSnapshot.fromCurrency !== quoteCurrency ||
				rateSnapshot.toCurrency !== currency
			)
				throw new AssetValuationError(
					"Câmbio ausente ou incompatível com a data e o par solicitados",
				);
			const rate = positiveDecimal(rateSnapshot.rate);
			units *= rate.units;
			digits += rate.digits;
		}
		return {
			amount: roundedFiat(units, digits, currency),
			assetCode,
			currency,
			date: input.date,
			exactAmount: exactDecimal(units, digits),
			fx: rateSnapshot,
			quantity: quantityText,
			quote,
			rounding: "HALF_AWAY_FROM_ZERO",
		};
	};
}
