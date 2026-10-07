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

export function createCurrencyExchangeService(store: CurrencyRateStore, fetcher: typeof fetch = fetch) {
	const pending = new Map<string, Promise<CurrencyRates>>();

	async function load(date: string, currency: string): Promise<CurrencyRates> {
		const stored = await store.find(date, currency);
		if (stored) return stored;
		const base = currency.toLowerCase();
		const urls = [
			`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.json`,
			`https://${date}.currency-api.pages.dev/v1/currencies/${base}.json`,
		];
		for (const url of urls) {
			let rates: CurrencyRates;
			try {
				const response = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
				if (!response.ok) continue;
				const payload: unknown = await response.json();
				if (
					!payload ||
					typeof payload !== "object" ||
					!("date" in payload) ||
					payload.date !== date ||
					!(base in payload)
				)
					continue;
				const values = (payload as Record<string, unknown>)[base];
				if (!values || typeof values !== "object" || Array.isArray(values)) continue;
				rates = {};
				for (const [code, value] of Object.entries(values)) {
					if (/^[a-z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0)
						rates[code.toUpperCase()] = value;
				}
				if (rates[currency] !== 1 || Object.keys(rates).length < 2) continue;
			} catch {
				continue;
			}
			return store.save(date, currency, rates);
		}
		throw new CurrencyRateUnavailableError(date, currency);
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
		return { amount: Math.round((amount * rate + Number.EPSILON) * 100) / 100, rate };
	}

	return { convert, ensure };
}
