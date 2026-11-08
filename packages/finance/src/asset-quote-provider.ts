/** Prices are decimal strings, independent of the quote currency's minor units. */
export interface AssetQuote {
	assetCode: string;
	quoteCurrency: string;
	price: string;
	/** UTC day of the source observation, never the fetch date. */
	date: string;
	sourceTime: string;
}

export interface AssetQuoteProvider {
	fetchQuotes(date: string, assetCodes: readonly string[], quoteCurrency: string): Promise<AssetQuote[]>;
}

export class AssetQuoteProviderError extends Error {
	constructor(
		message: string,
		readonly retryAfterMs = 0,
		readonly unavailable = false,
	) {
		super(message);
	}
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new AssetQuoteProviderError("Resposta brapi inválida");
	return value as Record<string, unknown>;
}

/** Expand JSON number notation without further floating point arithmetic.
 * JSON.parse already rounds number tokens to IEEE-754; lost digits cannot be recovered.
 */
function priceDecimal(value: unknown): string {
	if (typeof value !== "string" && typeof value !== "number")
		throw new AssetQuoteProviderError("Preço brapi inválido");
	const text = String(value);
	const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
	if (!match) throw new AssetQuoteProviderError("Preço brapi inválido");
	const digits = match[1] + (match[2] ?? "");
	const position = match[1].length + Number(match[3] ?? 0);
	if (Math.abs(position) > 1000) throw new AssetQuoteProviderError("Preço fora da precisão suportada");
	const expanded =
		position <= 0
			? `0.${"0".repeat(-position)}${digits}`
			: position >= digits.length
				? digits + "0".repeat(position - digits.length)
				: `${digits.slice(0, position)}.${digits.slice(position)}`;
	const [integer, fraction = ""] = expanded.split(".");
	const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
	const normalizedFraction = fraction.replace(/0+$/, "");
	if (
		normalizedInteger.length > 20 ||
		normalizedFraction.length > 18 ||
		BigInt(normalizedInteger + normalizedFraction) === 0n
	)
		throw new AssetQuoteProviderError("Preço fora da precisão suportada");
	return normalizedInteger + (normalizedFraction ? `.${normalizedFraction}` : "");
}

function sourceTime(value: unknown): string {
	if (
		typeof value !== "string" ||
		!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
		!Number.isFinite(Date.parse(value))
	)
		throw new AssetQuoteProviderError("Horário brapi inválido");
	return new Date(value).toISOString();
}

export interface BrapiAssetQuoteOptions {
	/** Pass BRAPI_TOKEN from the server environment; never expose it in a browser. */
	token: string;
	request?: typeof fetch;
	timeoutMs?: number;
}

/** One HTTP request per deduplicated batch; no retries or partial results. */
export function createBrapiAssetQuoteProvider({
	token,
	request = fetch,
	timeoutMs = 10_000,
}: BrapiAssetQuoteOptions): AssetQuoteProvider {
	if (!token.trim() || /[\r\n]/.test(token)) throw new RangeError("BRAPI_TOKEN inválido");
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new RangeError("Timeout inválido");
	return {
		async fetchQuotes(date, assetCodes, quoteCurrency) {
			if (
				date !== "latest" &&
				(!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
					!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
					new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
			)
				throw new RangeError("Data de cotação inválida");
			const codes = [...new Set(assetCodes.map(code => code.toUpperCase()))];
			const currency = quoteCurrency.toUpperCase();
			if (codes.some(code => !/^[A-Z0-9]{2,12}$/.test(code)) || !/^[A-Z]{3}$/.test(currency))
				throw new RangeError("Ativo ou moeda de cotação inválidos");
			if (!codes.length) return [];
			const url = new URL("https://brapi.dev/api/v2/crypto");
			url.searchParams.set("coin", codes.join(","));
			url.searchParams.set("currency", currency);
			if (date !== "latest") {
				url.searchParams.set("startDate", date);
				url.searchParams.set("endDate", date);
				url.searchParams.set("interval", "1d");
			}
			try {
				const response = await request(url, {
					headers: { Authorization: `Bearer ${token}` },
					signal: AbortSignal.timeout(timeoutMs),
				});
				if (!response.ok) {
					const retry = response.headers.get("retry-after");
					const delay = retry
						? Number(retry) * 1000 || Math.max(0, Date.parse(retry) - Date.now())
						: 0;
					throw new AssetQuoteProviderError(
						`brapi HTTP ${response.status}`,
						Number.isFinite(delay) ? Math.max(0, delay) : 0,
						response.status === 400 || response.status === 404,
					);
				}
				const payload = record(await response.json());
				if (!Array.isArray(payload.coins)) throw new AssetQuoteProviderError("Lote brapi inválido");
				const quotes = new Map<string, AssetQuote>();
				for (const item of payload.coins) {
					const coin = record(item);
					if (
						typeof coin.coin !== "string" ||
						!codes.includes(coin.coin) ||
						quotes.has(coin.coin) ||
						coin.currency !== currency
					)
						throw new AssetQuoteProviderError("Ativo ou moeda incompatível na resposta brapi");
					let time: string;
					let price: unknown;
					if (date === "latest") {
						time = sourceTime(coin.regularMarketTime);
						price = coin.regularMarketPrice;
					} else {
						if (!Array.isArray(coin.historicalDataPrice))
							throw new AssetQuoteProviderError("Histórico indisponível", 0, true);
						const points = coin.historicalDataPrice
							.map(record)
							.filter(
								point =>
									typeof point.date === "number" &&
									Number.isSafeInteger(point.date) &&
									Number.isFinite(new Date(point.date * 1000).getTime()) &&
									new Date(point.date * 1000).toISOString().slice(0, 10) === date,
							);
						if (points.length !== 1)
							throw new AssetQuoteProviderError("Histórico indisponível ou ambíguo", 0, true);
						time = new Date((points[0].date as number) * 1000).toISOString();
						price = points[0].close;
					}
					quotes.set(coin.coin, {
						assetCode: coin.coin,
						date: time.slice(0, 10),
						price: priceDecimal(price),
						quoteCurrency: currency,
						sourceTime: time,
					});
				}
				return codes.map(code => {
					const quote = quotes.get(code);
					if (!quote)
						throw new AssetQuoteProviderError(`Cotação indisponível para ${code}`, 0, true);
					return quote;
				});
			} catch (error) {
				if (error instanceof AssetQuoteProviderError) throw error;
				// Do not propagate transport error text, which may contain credentials.
				throw new AssetQuoteProviderError("Falha no transporte ou JSON brapi");
			}
		},
	};
}
