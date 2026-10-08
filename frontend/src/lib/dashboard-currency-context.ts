import type { Dashboard } from "./api";
import type { readCurrencyEstimate, readCurrencyRate, requestHistoryCollection } from "./financial-history";

export class GuestConversionUnavailable extends Error {
	constructor(
		readonly currency: string,
		readonly date: string,
		readonly consolidation?: Dashboard["consolidation"],
	) {
		super(`Conversão de ${currency} indisponível em ${date}`);
	}
}
interface Dependencies {
	readCurrencyRate: typeof readCurrencyRate;
	readCurrencyEstimate: typeof readCurrencyEstimate;
	requestHistoryCollection: typeof requestHistoryCollection;
}
export async function guestDashboardCurrencyContext(
	input: {
		currency: string;
		reference: string;
		nativeCurrencies: string[];
		forecastCurrencies: string[];
		positions: { currency: string; date: string }[];
		forecasting: boolean;
	},
	dependencies?: Dependencies,
) {
	const api = dependencies ?? (await import("./financial-history"));
	const foreign = [...new Set(input.nativeCurrencies)].filter(source => source !== input.currency);
	const forecastForeign = [...new Set(input.forecastCurrencies)].filter(source => source !== input.currency);
	const factors = new Map<string, number>(),
		forecasts = new Map<string, number>();
	const publishedDates: Record<string, string> = {};
	const histories: NonNullable<Dashboard["consolidation"]>["histories"] = [];
	if (input.forecasting)
		for (const source of forecastForeign) {
			const collection = await api
				.requestHistoryCollection("CURRENCY", [source, input.currency], input.reference)
				.catch(() => null);
			if (!collection) continue;
			const estimate = await api.readCurrencyEstimate(collection.id, input.currency);
			if (!estimate) continue;
			histories.push({
				collectionId: collection.id,
				coveredDays: estimate.progress.coveredDays,
				endDate: estimate.endDate,
				requestedDays: estimate.progress.requestedDays,
				startDate: estimate.startDate,
				state: estimate.progress.state,
			});
			const rate = estimate.estimates.find(row => row.baseCurrency === source)?.rate;
			if (rate != null && rate > 0) forecasts.set(source, rate);
		}
	const positions = new Map(
		input.positions
			.filter(row => row.currency !== input.currency && row.date < input.reference)
			.map(row => [`${row.currency}:${row.date}`, row]),
	);
	const requests = [...foreign.map(currency => ({ currency, date: input.reference })), ...positions.values()];
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(2, requests.length) }, async () => {
			while (cursor < requests.length) {
				const { currency, date } = requests[cursor++]!;
				const result = await api.readCurrencyRate(
					date === input.reference ? "latest" : date,
					currency,
					input.currency,
				);
				if (result) {
					factors.set(`${currency}:${date}`, result.rate);
					if (date === input.reference) publishedDates[currency] = result.date;
				}
			}
		}),
	);
	const consolidation = {
		forecastAvailable: forecastForeign.every(source => forecasts.has(source)),
		histories,
		method: "EXPONENTIAL_90_DAY_HALF_LIFE" as const,
		publishedDates,
		unavailable: false,
	};
	function factor(source: string, date: string) {
		if (source === input.currency) return 1;
		const value = date > input.reference ? forecasts.get(source) : factors.get(`${source}:${date}`);
		if (value == null || !Number.isFinite(value) || value <= 0)
			throw new GuestConversionUnavailable(source, date, consolidation);
		return value;
	}
	return {
		consolidation,
		convert: (amount: number, source: string, date: string) =>
			amount === 0 ? 0 : amount * factor(source, date),
		currency: input.currency,
		factor,
	};
}
