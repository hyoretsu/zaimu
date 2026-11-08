import { type AssetQuoteProvider, AssetQuoteProviderError } from "@zaimu/finance/asset-quote-provider";

export interface CoinbaseAssetQuoteOptions {
	request?: typeof fetch;
	timeoutMs?: number;
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new AssetQuoteProviderError("Resposta Coinbase inválida");
	return value as Record<string, unknown>;
}

/** Asset IDs are explicit Coinbase identities supplied by the caller, not local tickers.
 * Historical spot responses have no observation timestamp: the date query identifies
 * the source day, represented at UTC midnight, not the time this request was fetched.
 */
export function createCoinbaseAssetQuoteProvider({
	request = fetch,
	timeoutMs = 10_000,
}: CoinbaseAssetQuoteOptions = {}): AssetQuoteProvider {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new RangeError("Timeout inválido");
	return {
		async fetchQuotes(date, assetIds, quoteCurrency) {
			if (
				!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
				!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
				new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
			)
				throw new RangeError("Data de cotação histórica inválida");
			if (quoteCurrency !== "USD") throw new RangeError("Coinbase exige cotação em USD");
			const ids = [...new Set(assetIds)];
			if (ids.some(id => !/^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/.test(id)))
				throw new RangeError("Identidade Coinbase inválida");
			try {
				const quotes = [];
				for (const id of ids) {
					const url = new URL(`https://api.coinbase.com/v2/prices/${id}-USD/spot`);
					url.searchParams.set("date", date);
					const response = await request(url, { signal: AbortSignal.timeout(timeoutMs) });
					if (!response.ok) {
						const retry = response.headers.get("retry-after");
						const delay = retry
							? /^\d+(?:\.\d+)?$/.test(retry)
								? Number(retry) * 1000
								: Date.parse(retry) - Date.now()
							: 0;
						throw new AssetQuoteProviderError(
							`Coinbase HTTP ${response.status}`,
							Number.isFinite(delay) ? Math.max(0, delay) : 0,
							response.status === 400 || response.status === 404,
						);
					}
					const data = record(record(await response.json()).data);
					if (
						data.currency !== "USD" ||
						typeof data.amount !== "string" ||
						!/^\d{1,20}(?:\.\d{1,18})?$/.test(data.amount) ||
						!/[1-9]/.test(data.amount)
					)
						throw new AssetQuoteProviderError("Preço ou moeda Coinbase inválidos");
					quotes.push({
						assetCode: id,
						date,
						price: data.amount,
						quoteCurrency: "USD",
						sourceTime: `${date}T00:00:00.000Z`,
					});
				}
				return quotes;
			} catch (error) {
				if (error instanceof AssetQuoteProviderError) throw error;
				throw new AssetQuoteProviderError("Falha no transporte ou JSON Coinbase");
			}
		},
	};
}
