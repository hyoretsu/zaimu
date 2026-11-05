import { decimalToUnits, unitsToDecimal } from "@zaimu/finance/asset-amount";
import type { AssetQuote } from "@zaimu/finance/asset-quote-provider";
import { createAssetValuationResolver } from "@zaimu/finance/asset-valuation";
import { isCryptoAsset, roundMoney } from "@zaimu/finance/money";
import type { FinancialFee } from "./api";
import { getLocalDateKey } from "./date";

export async function guestRate(date: string, from: string, to: string) {
	if (from === to) return 1;
	const { readCurrencyRate } = await import("./financial-history");
	const snapshot = await readCurrencyRate(date, from, to);
	if (!snapshot || !Number.isFinite(snapshot.rate) || snapshot.rate <= 0)
		throw new Error(`Conversão de ${from} para ${to} indisponível`);
	return snapshot.rate;
}

export function convertLocalMoney(
	amount: number,
	date: string,
	from: string,
	to: string,
	fees?: FinancialFee[],
	exchange?: typeof guestRate,
): Promise<{
	amount: number;
	bookingCurrency: string;
	currency: string;
	exchangeRate: number;
	fees: FinancialFee[];
	originalAmount: number;
}>;
export function convertLocalMoney(
	amount: string | number,
	date: string,
	from: string,
	to: string,
	fees?: FinancialFee[],
	exchange?: typeof guestRate,
): Promise<{
	amount: string | number;
	bookingCurrency: string;
	currency: string;
	exchangeRate: number | null;
	fees: FinancialFee[];
	originalAmount: string | number;
}>;
export async function convertLocalMoney(
	amount: number | string,
	date: string,
	from: string,
	to: string,
	fees: FinancialFee[] = [],
	exchange: typeof guestRate = guestRate,
) {
	if (isCryptoAsset(from) || isCryptoAsset(to)) {
		if (from !== to) throw new Error("Conversão crypto exige valores explícitos por ativo");
		if (typeof amount !== "string") throw new Error("Quantidade crypto exige decimal exato");
		for (const fee of fees) {
			const code = fee.assetCode ?? from;
			if (!fee.name.trim()) throw new Error("Taxa inválida");
			if (fee.type === "PERCENTAGE") {
				if (code !== from || !/^\d+(?:\.\d+)?$/.test(String(fee.amount)))
					throw new Error("Taxa percentual inválida");
			} else {
				if (isCryptoAsset(code) && typeof fee.amount !== "string")
					throw new Error("Taxa crypto exige decimal exato");
				if (decimalToUnits(String(fee.amount), code) < 0n) throw new Error("Taxa inválida");
			}
		}
		const units = decimalToUnits(amount, from);
		if (units <= 0n) throw new Error("Informe um valor maior que zero");
		return {
			amount: unitsToDecimal(units, from),
			bookingCurrency: from,
			currency: from,
			exchangeRate: null,
			fees,
			originalAmount: amount,
		};
	}
	amount = Number(amount);
	if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor maior que zero");
	const total =
		amount +
		fees.reduce((sum, fee) => {
			if (fee.assetCode && fee.assetCode !== from) {
				if (fee.type === "PERCENTAGE") throw new Error("Taxa percentual exige o ativo de origem");
				if (isCryptoAsset(fee.assetCode) && typeof fee.amount !== "string")
					throw new Error("Taxa crypto exige decimal exato");
				if (!fee.name.trim() || decimalToUnits(String(fee.amount), fee.assetCode) < 0n)
					throw new Error("Taxa inválida");
				return sum;
			}
			const feeAmount = Number(fee.amount);
			if (!Number.isFinite(feeAmount) || feeAmount < 0 || !fee.name.trim())
				throw new Error("Taxa inválida");
			return sum + (fee.type === "PERCENTAGE" ? (amount * feeAmount) / 100 : feeAmount);
		}, 0);
	const rate = from === to ? 1 : await exchange(date, from, to);
	return {
		amount: roundMoney(total * rate, to),
		bookingCurrency: to,
		currency: from,
		exchangeRate: rate,
		fees,
		originalAmount: amount,
	};
}

/** Quote exact native quantity first; only the final fiat value becomes a number. */
export async function valueAssetPosition(
	position: import("./consolidated-money").MoneyPosition,
	currency: string,
	date = "latest",
) {
	if (!isCryptoAsset(position.currency))
		return (
			Number(position.amount) *
			(await guestRate(date === "latest" ? getLocalDateKey() : date, position.currency, currency))
		);
	if (typeof position.amount !== "string") throw new Error("Quantidade crypto exige decimal exato");
	const day = date === "latest" ? getLocalDateKey() : date;
	const [{ useAuthStore }, { localMeta }] = await Promise.all([
		import("@/stores/auth"),
		import("./localStorage"),
	]);
	let amount: string;
	if (useAuthStore.getState().isGuestMode) {
		const resolver = createAssetValuationResolver({
			fx: {
				getRate: async (rateDate, fromCurrency, toCurrency) => ({
					date: rateDate,
					fromCurrency,
					rate: String(await guestRate(rateDate, fromCurrency, toCurrency)),
					toCurrency,
				}),
			},
			quotes: {
				getQuote: async (quoteDate, assetCode, quoteCurrency) => {
					const key = `asset-quote:${quoteDate}:${assetCode}:${quoteCurrency}`;
					const cached = (await localMeta.get(key)) as AssetQuote | null;
					if (cached) return cached;
					const { default: client } = await import("./api/client-api");
					const quote = (
						await client<AssetQuote>({
							authenticated: false,
							method: "GET",
							params: { assetCode, date: quoteDate },
							url: "/currencies/asset-quote",
						})
					).data;
					if (
						quote.date !== quoteDate ||
						quote.assetCode !== assetCode ||
						quote.quoteCurrency !== quoteCurrency
					)
						throw new Error("Cotação histórica de ativo indisponível");
					await localMeta.set(key, quote);
					return quote;
				},
			},
		});
		amount = (
			await resolver({
				assetCode: position.currency,
				date: day,
				preferredCurrency: currency,
				quantity: position.amount,
				quoteCurrency: "USD",
			})
		).amount;
	} else {
		const { default: client } = await import("./api/client-api");
		amount = (
			await client<{ amount: string; from: string; to: string; date: string }>({
				method: "GET",
				params: { amount: position.amount, date: day, from: position.currency, to: currency },
				url: "/currencies/convert-asset",
			})
		).data.amount;
	}
	const value = Number(amount);
	if (!Number.isFinite(value)) throw new Error("Cotação de ativo indisponível");
	return value;
}
