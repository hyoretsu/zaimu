import { fetchCurrencySnapshot } from "@zaimu/finance/currency-provider";
import { roundMoney } from "@zaimu/finance/money";
export type CurrencyRates = Record<string, number>;
export interface CurrencyRateStore {
	latest?: (baseCurrency: string) => Promise<{ date: string; rates: CurrencyRates } | null>;
	find: (date: string, baseCurrency: string) => Promise<CurrencyRates | null>;
	save: (date: string, baseCurrency: string, rates: CurrencyRates) => Promise<CurrencyRates>;
}

export class CurrencyRateUnavailableError extends Error {
	constructor(date: string, currency: string) {
		super(`Cotação de ${currency} indisponível em ${date}. Tente novamente mais tarde.`);
		this.name = "CurrencyRateUnavailableError";
	}
}

export function normalizeCurrency(currency: string) {
	const normalized = currency.trim().toUpperCase();
	if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Moeda inválida. Use um código ISO de três letras.");
	return normalized;
}

export function currencyRateDate(date: string | Date) {
	const value = date instanceof Date ? date.toISOString().slice(0, 10) : date.slice(0, 10);
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		!Number.isFinite(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== value
	)
		throw new Error("Data de conversão inválida.");
	return value;
}

export function createCurrencyExchangeService(
	store: CurrencyRateStore,
	fetcher: typeof fetch = fetch,
	download: <T>(operation: () => Promise<T>) => Promise<T> = operation => operation(),
) {
	const pending = new Map<string, Promise<CurrencyRates>>();

	async function load(date: string, currency: string): Promise<CurrencyRates> {
		const stored = await store.find(date, currency);
		if (stored) return stored;
		const snapshot = await download(() => fetchCurrencySnapshot(date, currency, fetcher));
		return store.save(snapshot.date, snapshot.baseCurrency, snapshot.rates);
	}

	function snapshot(date: string, currency: string) {
		const key = `${date}:${currency}`;
		const existing = pending.get(key);
		if (existing) return existing;
		const result = load(date, currency).finally(() => pending.delete(key));
		pending.set(key, result);
		return result;
	}

	async function ensure(dateInput: string | Date, fromInput: string, toInput: string) {
		const date = currencyRateDate(dateInput);
		const from = normalizeCurrency(fromInput);
		const to = normalizeCurrency(toInput);
		if (from === to) return 1;
		const [rates] = await Promise.all([snapshot(date, from), snapshot(date, to)]);
		const rate = rates[to];
		if (!rate) throw new CurrencyRateUnavailableError(date, `${from}/${to}`);
		return rate;
	}

	async function convert(amount: number, date: string | Date, from: string, to: string) {
		if (!Number.isFinite(amount)) throw new Error("Valor de conversão inválido.");
		const rate = await ensure(date, from, to);
		return { amount: roundMoney(amount * rate, to), rate };
	}

	const latestPending = new Map<string, Promise<{ date: string; rate: number }>>();
	function latest(fromInput: string, toInput: string) {
		const from = normalizeCurrency(fromInput),
			to = normalizeCurrency(toInput);
		if (from === to) return Promise.resolve({ date: new Date().toISOString().slice(0, 10), rate: 1 });
		const key = `${from}:${to}`;
		const previous = latestPending.get(key);
		if (previous) return previous;
		const operation = (async () => {
			const stored = await store.latest?.(from);
			let result = stored;
			if (!stored || stored.date !== new Date().toISOString().slice(0, 10)) {
				try {
					const snapshot = await download(() => fetchCurrencySnapshot("latest", from, fetcher));
					result = {
						date: snapshot.date,
						rates: await store.save(snapshot.date, snapshot.baseCurrency, snapshot.rates),
					};
				} catch (error) {
					if (!stored) throw error;
				}
			}
			const rate = result?.rates[to];
			if (!result || !rate) throw new CurrencyRateUnavailableError("latest", `${from}/${to}`);
			await snapshot(result.date, to);
			return { date: result.date, rate };
		})().finally(() => latestPending.delete(key));
		latestPending.set(key, operation);
		return operation;
	}
	return { convert, ensure, latest };
}
