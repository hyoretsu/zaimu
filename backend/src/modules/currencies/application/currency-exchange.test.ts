import { describe, expect, test } from "bun:test";
import { type CurrencyRates, createCurrencyExchangeService, currencyRateDate } from "./currency-exchange";

function fixture(invalidDate = false) {
	const records = new Map<string, CurrencyRates>();
	const calls: string[] = [];
	const service = createCurrencyExchangeService(
		{
			async find(date, base) {
				return records.get(`${date}:${base}`) ?? null;
			},
			async save(date, base, rates) {
				records.set(`${date}:${base}`, rates);
				return rates;
			},
		},
		(async (url: string | URL | Request) => {
			const value = String(url);
			calls.push(value);
			const base = value.includes("/usd.json") ? "usd" : "brl";
			return new Response(
				JSON.stringify({
					date: invalidDate ? "2026-10-06" : "2026-10-07",
					[base]:
						base === "usd"
							? { brl: 5.25, btc: 0.00001, eur: 0.87, usd: 1 }
							: { brl: 1, eur: 0.16, usd: 1 / 5.25 },
				}),
			);
		}) as typeof fetch,
	);
	return { calls, records, service };
}

describe("daily on-demand currency exchange", () => {
	test("fetches both full base snapshots once and converts with cents", async () => {
		const { service, calls, records } = fixture();
		expect(await service.convert(10.01, "2026-10-07", "usd", "BRL")).toEqual({ amount: 52.55, rate: 5.25 });
		expect(records.get("2026-10-07:USD")?.EUR).toBe(0.87);
		await service.ensure("2026-10-07", "USD", "BRL");
		expect(calls).toHaveLength(2);
		expect(records.size).toBe(2);
	});
	test("same currency does not fetch or persist unused dates", async () => {
		const { service, calls, records } = fixture();
		expect(await service.ensure("2020-01-01", "BRL", "BRL")).toBe(1);
		expect(calls).toHaveLength(0);
		expect(records.size).toBe(0);
	});
	test("concurrent conversions deduplicate downloads", async () => {
		const { service, calls } = fixture();
		await Promise.all(Array.from({ length: 10 }, () => service.ensure("2026-10-07", "USD", "BRL")));
		expect(calls).toHaveLength(2);
	});
	test("rejects incorrect historical response date without latest fallback or persistence", async () => {
		const { service, calls, records } = fixture(true);
		await expect(service.ensure("2026-10-07", "USD", "BRL")).rejects.toThrow("indisponível");
		expect(records.size).toBe(0);
		expect(calls.every(url => !url.includes("latest"))).toBe(true);
	});
	test("falls back to same-day mirror and retries failures", async () => {
		const calls: string[] = [];
		let fail = true;
		const service = createCurrencyExchangeService(
			{
				async find() {
					return null;
				},
				async save(_date, _base, rates) {
					return rates;
				},
			},
			(async (url: string | URL | Request) => {
				const value = String(url);
				calls.push(value);
				if (fail || value.includes("cdn.jsdelivr.net")) return new Response("missing", { status: 404 });
				const base = value.includes("/usd.json") ? "usd" : "brl";
				return new Response(
					JSON.stringify({
						date: "2026-10-07",
						[base]: base === "usd" ? { brl: 5, usd: 1 } : { brl: 1, usd: 0.2 },
					}),
				);
			}) as typeof fetch,
		);
		await expect(service.ensure("2026-10-07", "USD", "BRL")).rejects.toThrow("indisponível");
		fail = false;
		// Let both rejected downloads release their deduplication slots.
		await Promise.resolve();
		expect(await service.ensure("2026-10-07", "USD", "BRL")).toBe(5);
		expect(calls.some(url => url.includes("2026-10-07.currency-api.pages.dev"))).toBe(true);
	});
	test("validates calendar dates", () => {
		expect(() => currencyRateDate("2026-02-30")).toThrow("inválida");
		expect(currencyRateDate("2026-10-07T23:59:00Z")).toBe("2026-10-07");
	});
});
