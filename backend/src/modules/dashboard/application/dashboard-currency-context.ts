import { recurrenceNeedsConfiguration } from "@zaimu/finance/recurrence";
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
	const accountCurrencies = new Map(loaded.accounts.map(row => [row.id, row.currency ?? "BRL"]));
	const currentCurrencies = new Set<string>();
	const forecastCurrencies = new Set<string>();
	for (const row of loaded.balanceRows) {
		if (!Number(row.balance) || row.date !== reference) continue;
		const source = accountCurrencies.get(row.accountId) ?? "BRL";
		currentCurrencies.add(source);
		forecastCurrencies.add(source);
	}
	for (const row of loaded.cards) if (Number(row.creditLimit)) currentCurrencies.add(row.currency ?? "BRL");
	for (const row of loaded.debts) if (Number(row.balance)) currentCurrencies.add(row.currency ?? "BRL");
	const addMovementAccounts = (origin?: string | null, destination?: string | null) => {
		for (const id of [origin, destination])
			if (id && accountCurrencies.has(id)) forecastCurrencies.add(accountCurrencies.get(id)!);
	};
	for (const row of loaded.flows) {
		if (!row.amount) continue;
		const date = dateKey(row.date);
		if (date === reference) currentCurrencies.add(row.currency ?? "BRL");
		if (date > reference) {
			forecastCurrencies.add(row.currency ?? "BRL");
			addMovementAccounts(row.originAccountId, row.destinationAccountId);
		}
	}
	for (const row of loaded.recurrences)
		if (
			row.amount &&
			!recurrenceNeedsConfiguration(row) &&
			(!row.endDate || String(row.endDate).slice(0, 10) > reference)
		) {
			forecastCurrencies.add(row.currency ?? "BRL");
			addMovementAccounts(row.originFinancialAccountId, row.destinationFinancialAccountId);
		}
	for (const row of loaded.loanPayments)
		if (!row.paidDate && Number(row.totalPaid) && dateKey(row.dueDate) > reference)
			forecastCurrencies.add(row.currency ?? "BRL");
	for (const row of loaded.projectedStatements ?? [])
		if (Number(row.balanceAmount) && dateKey(row.dueDate) > reference)
			forecastCurrencies.add(loaded.cards.find(card => card.id === row.creditCardId)?.currency ?? "BRL");
	const forecastForeign = [...forecastCurrencies].filter(source => source !== currency);
	const factors = new Map<string, number>();
	const forecastFactors = new Map<string, number>();
	const publishedDates: Record<string, string> = {};
	const missing = new Set<string>();
	const collections: NonNullable<Awaited<ReturnType<typeof dependencies.estimate>>>[] = [];
	// Register forecast demand only. Reads of progress never schedule a fresh window.
	if (forecasting)
		for (const source of forecastForeign) {
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
		const source = accountCurrencies.get(row.accountId) ?? "BRL";
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
	const requests = [
		...[...currentCurrencies]
			.filter(source => source !== currency)
			.map(source => ({ date: reference, source })),
		...needed.values(),
	];
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
		forecastAvailable: forecastForeign.every(source => forecastFactors.has(source)),
		missing: [...missing],
		publishedDates,
	};
}
export type DashboardCurrencyContext = Awaited<ReturnType<typeof dashboardCurrencyContext>>;
