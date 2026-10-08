import { expect, test } from "bun:test";
import { GuestConversionUnavailable, guestDashboardCurrencyContext } from "./dashboard-currency-context";

const input = {
	currency: "BRL",
	forecastCurrencies: ["USD"],
	forecasting: true,
	nativeCurrencies: ["USD"],
	positions: [{ currency: "USD", date: "2026-10-01" }],
	reference: "2026-10-08",
};
const dependencies = {
	readCurrencyEstimate: async () => null,
	readCurrencyRate: async (date: string, from: string, to: string) => ({
		date: date === "latest" ? "2026-10-07" : date,
		from,
		rate: date === "latest" ? 6 : 5,
		to,
	}),
	requestHistoryCollection: async () => null,
};
test("visitor preserves publication dates and exact historical rates without forecast samples", async () => {
	const context = await guestDashboardCurrencyContext(input, dependencies);
	expect(context.convert(10, "USD", "2026-10-01")).toBe(50);
	expect(context.convert(10, "USD", "2026-10-08")).toBe(60);
	expect(context.consolidation.publishedDates.USD).toBe("2026-10-07");
	expect(context.consolidation.forecastAvailable).toBe(false);
	expect(() => context.convert(10, "USD", "2026-10-09")).toThrow(GuestConversionUnavailable);
});
test("offline missing conversion never becomes zero and native values remain available", async () => {
	const context = await guestDashboardCurrencyContext(input, {
		...dependencies,
		readCurrencyRate: async () => null,
		requestHistoryCollection: async () => {
			throw new Error("Offline");
		},
	});
	expect(context.convert(10, "BRL", "2026-10-08")).toBe(10);
	expect(() => context.convert(10, "USD", "2026-10-08")).toThrow(GuestConversionUnavailable);
});
test("historical reads do not create forecast demand", async () => {
	let requests = 0;
	await guestDashboardCurrencyContext(
		{ ...input, forecasting: false },
		{
			...dependencies,
			requestHistoryCollection: async () => {
				requests++;
				return null;
			},
		},
	);
	expect(requests).toBe(0);
});

test("forecast requests only demanded currency pairs and exposes partial coverage", async () => {
	const requests: string[][] = [];
	const progress = {
		canRetry: false,
		completed: 24,
		coveredDays: 12,
		failed: 0,
		lastActivity: null,
		pending: 705,
		requestedDays: 365,
		running: 1,
		state: "RUNNING" as const,
		total: 730,
		unavailable: 0,
	};
	const context = await guestDashboardCurrencyContext(
		{ ...input, nativeCurrencies: ["USD", "EUR"] },
		{
			...dependencies,
			readCurrencyEstimate: async () => ({
				collectionId: "collection",
				currency: "BRL",
				endDate: "2026-10-07",
				estimates: [
					{ baseCurrency: "USD", firstDate: "2026-09-26", lastDate: "2026-10-07", rate: 5.5, samples: 12 },
				],
				method: "EXPONENTIAL_90_DAY_HALF_LIFE",
				progress,
				startDate: "2025-10-08",
			}),
			requestHistoryCollection: async (kind, series) => {
				requests.push(series);
				return {
					endDate: "2026-10-07",
					id: "collection",
					kind,
					progress,
					series,
					startDate: "2025-10-08",
					units: [],
				};
			},
		},
	);
	expect(requests).toEqual([["USD", "BRL"]]);
	expect(context.convert(10, "USD", "2026-10-09")).toBe(55);
	expect(context.consolidation.forecastAvailable).toBe(true);
	expect(context.consolidation.histories[0]?.coveredDays).toBe(12);
});
