import { ensureCurrencyRates, getLatestCurrencyRate } from "~/modules/currencies/infra/currency-exchange";
import { getCurrencyHistoryEstimate } from "~/modules/financial-history/application/currency-history-estimate";
import { requestHistoryCollection } from "~/modules/financial-history/application/history-collections";
import { dateKey } from "./dashboard-calculations";
import type { loadDashboardData } from "./load-dashboard-data";

export class DashboardConversionUnavailable extends Error {
	constructor(
		readonly currency: string,
		readonly date: string,
	) {
		super(`Conversão de ${currency} indisponível em ${date}`);
	}
}
const defaultDependencies = {
	estimate: getCurrencyHistoryEstimate,
	historical: ensureCurrencyRates,
	latest: getLatestCurrencyRate,
	request: requestHistoryCollection,
};

/** Public reporting factors never modify a native book or a concrete booking. */
export async function dashboardCurrencyContext(
	loaded: Awaited<ReturnType<typeof loadDashboardData>>,
	currency: string,
	today: Date,
	forecasting: boolean,
	dependencies = defaultDependencies,
) {
	const reference = dateKey(today);
	const currencies = [
		...new Set([
			currency,
			...loaded.accounts.map(row => row.currency ?? "BRL"),
			...loaded.cards.map(row => row.currency ?? "BRL"),
			...loaded.flows.map(row => row.currency ?? "BRL"),
			...loaded.recurrences.map(row => row.currency ?? "BRL"),
			...loaded.loanPayments.map(row => row.currency ?? "BRL"),
			...loaded.debts.map(row => row.currency ?? "BRL"),
		]),
	];
	const foreign = currencies.filter(source => source !== currency);
	const factors = new Map<string, number>();
	const forecastFactors = new Map<string, number>();
	const publishedDates: Record<string, string> = {};
	const missing = new Set<string>();
	const collections: NonNullable<Awaited<ReturnType<typeof dependencies.estimate>>>[] = [];
	// Register forecast demand only. Reads of progress never schedule a fresh window.
	if (forecasting)
		for (const source of foreign) {
			const collection = await dependencies.request("CURRENCY", [source, currency], reference);
			if (!collection) continue;
			const estimate = await dependencies.estimate(collection.id, currency);
			if (estimate) {
				collections.push(estimate);
				const factor = estimate.estimates.find(row => row.baseCurrency === source)?.rate;
				if (factor != null && factor > 0) forecastFactors.set(source, factor);
			}
		}
	// Historical flows use their event date; positions use their position date.
	const needed = new Map<string, { source: string; date: string }>();
	for (const row of loaded.balanceRows) {
		const source = loaded.accounts.find(account => account.id === row.accountId)?.currency ?? "BRL";
		if (source !== currency && row.date < reference && Number(row.balance))
			needed.set(`${source}:${row.date}`, { date: row.date, source });
	}
	for (const row of loaded.flows) {
		const source = row.currency ?? "BRL",
			date = dateKey(row.date);
		if (source !== currency && date < reference && row.amount)
			needed.set(`${source}:${date}`, { date, source });
	}
	// Bound point downloads too; each request fetches both involved bases.
	const requests = [...foreign.map(source => ({ date: reference, source })), ...needed.values()];
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(2, requests.length) }, async () => {
			while (cursor < requests.length) {
				const { source, date } = requests[cursor++]!;
				try {
					if (date === reference) {
						const latest = await dependencies.latest(source, currency);
						factors.set(`${source}:${date}`, latest.rate);
						publishedDates[source] = latest.date;
					} else factors.set(`${source}:${date}`, await dependencies.historical(date, source, currency));
				} catch {
					missing.add(`${source}:${date}`);
				}
			}
		}),
	);
	function factor(source = "BRL", date = reference) {
		if (source === currency) return 1;
		const value = date > reference ? forecastFactors.get(source) : factors.get(`${source}:${date}`);
		if (value == null || !Number.isFinite(value) || value <= 0)
			throw new DashboardConversionUnavailable(source, date);
		return value;
	}
	return {
		collections,
		convert: (amount: number, source = "BRL", date = reference) =>
			amount === 0 ? 0 : amount * factor(source, date),
		currency,
		factor,
		forecastAvailable: foreign.every(source => forecastFactors.has(source)),
		missing: [...missing],
		publishedDates,
	};
}
export type DashboardCurrencyContext = Awaited<ReturnType<typeof dashboardCurrencyContext>>;
