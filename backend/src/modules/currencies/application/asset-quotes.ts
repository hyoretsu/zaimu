import type { AssetQuote, AssetQuoteProvider } from "@zaimu/finance/asset-quote-provider";
import { currencyRateDate, CurrencyRateUnavailableError } from "./currency-exchange";

export interface AssetQuoteStore {
	find(
		date: string,
		assetCode: string,
		quoteCurrency: string,
		provider: string,
	): Promise<AssetQuote | null>;
	save(quote: AssetQuote, provider: string): Promise<AssetQuote>;
}

/** Provider identities are explicit mappings, never inferred from a ticker or stablecoin name. */
export function createAssetQuoteService({
	store,
	identity,
	provider,
}: {
	store: AssetQuoteStore;
	identity(assetCode: string): Promise<string | null>;
	provider(identity: string): { client: AssetQuoteProvider; assetId: string } | null;
}) {
	const pending = new Map<string, Promise<AssetQuote>>();
	return function getQuote(
		dateInput: string | Date,
		assetInput: string,
		currencyInput: string,
	): Promise<AssetQuote> {
		const date = currencyRateDate(dateInput);
		const assetCode = assetInput.trim().toUpperCase();
		const quoteCurrency = currencyInput.trim().toUpperCase();
		if (!/^[A-Z0-9]{2,12}$/.test(assetCode) || !/^[A-Z]{3}$/.test(quoteCurrency))
			throw new RangeError("Ativo ou moeda inválidos");
		const key = `${date}:${assetCode}:${quoteCurrency}`;
		const existing = pending.get(key);
		if (existing) return existing;
		const operation = (async () => {
			const mapping = await identity(assetCode);
			if (!mapping) throw new CurrencyRateUnavailableError(date, assetCode);
			const stored = await store.find(date, assetCode, quoteCurrency, mapping);
			if (stored) return stored;
			const adapter = provider(mapping);
			if (!adapter) throw new CurrencyRateUnavailableError(date, assetCode);
			const quotes = await adapter.client.fetchQuotes(date, [adapter.assetId], quoteCurrency);
			const quote = quotes[0];
			if (
				quotes.length !== 1 ||
				!quote ||
				quote.assetCode !== adapter.assetId ||
				quote.quoteCurrency !== quoteCurrency ||
				quote.date !== date ||
				new Date(quote.sourceTime).toISOString().slice(0, 10) !== date ||
				!/^\d+(?:\.\d{1,18})?$/.test(quote.price) ||
				!/[1-9]/.test(quote.price)
			)
				throw new CurrencyRateUnavailableError(date, assetCode);
			return store.save({ ...quote, assetCode }, mapping);
		})().finally(() => pending.delete(key));
		pending.set(key, operation);
		return operation;
	};
}
