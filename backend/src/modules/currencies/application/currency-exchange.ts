import { fetchCurrencySnapshot } from "@zaimu/finance/currency-provider";
import { roundMoney } from "@zaimu/finance/money";
export type CurrencyRates = Record<string, number>;
export interface CurrencyRateStore {
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

	return { convert, ensure };
}
