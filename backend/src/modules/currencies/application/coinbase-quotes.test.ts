import { describe, expect, test } from "bun:test";
import { AssetQuoteProviderError } from "@zaimu/finance/asset-quote-provider";
import { createCoinbaseAssetQuoteProvider } from "./coinbase-quotes";

function client(payload: unknown, status = 200, headers?: Record<string, string>) {
	const urls: string[] = [];
	const request = (async (input: Parameters<typeof fetch>[0]) => {
		urls.push(String(input));
		return Response.json(payload, { headers, status });
	}) as typeof fetch;
	return { provider: createCoinbaseAssetQuoteProvider({ request }), urls };
}

const date = "2024-02-29";

describe("Coinbase historical USD quotes", () => {
	test("uses explicit provider IDs and historical day, preserving decimal text exactly", async () => {
		const price = "99999.123456789123456789";
		const { urls, provider } = client({ data: { amount: price, base: "BTC", currency: "USD" } });
		const id = "a0b1c2d3-1234-4321-abcd-0123456789ab";
		expect(await provider.fetchQuotes(date, [id, id], "USD")).toEqual([
			{ assetCode: id, date, price, quoteCurrency: "USD", sourceTime: `${date}T00:00:00.000Z` },
		]);
		expect(urls).toEqual([`https://api.coinbase.com/v2/prices/${id}-USD/spot?date=${date}`]);
	});

	test("returns all requested identities in order without guessing from payload base", async () => {
		const { provider, urls } = client({
			data: { amount: "0.000000000000000001", base: "unrelated", currency: "USD" },
		});
		const quotes = await provider.fetchQuotes(date, ["BTC", "ETH"], "USD");
		expect(quotes.map(quote => quote.assetCode)).toEqual(["BTC", "ETH"]);
		expect(urls).toHaveLength(2);
	});

	for (const amount of [
		1,
		null,
		"",
		"0",
		"0.000",
		"-1",
		"NaN",
		"Infinity",
		"1e3",
		" 1",
		"1.1234567891234567891",
	]) {
		test(`rejects invalid amount ${JSON.stringify(amount)}`, async () => {
			const { provider } = client({ data: { amount, currency: "USD" } });
			await expect(provider.fetchQuotes(date, ["BTC"], "USD")).rejects.toBeInstanceOf(
				AssetQuoteProviderError,
			);
		});
	}

	for (const payload of [null, {}, { data: [] }, { data: { amount: "1", currency: "EUR" } }]) {
		test(`rejects malformed payload ${JSON.stringify(payload)}`, async () => {
			await expect(client(payload).provider.fetchQuotes(date, ["BTC"], "USD")).rejects.toBeInstanceOf(
				AssetQuoteProviderError,
			);
		});
	}

	test("rejects invalid dates, latest, currency and identities before transport", async () => {
		const { provider, urls } = client({});
		for (const day of ["latest", "2024-02-30", "2024-2-29", "invalid"])
			await expect(provider.fetchQuotes(day, ["BTC"], "USD")).rejects.toBeInstanceOf(RangeError);
		await expect(provider.fetchQuotes(date, ["BTC"], "BRL")).rejects.toBeInstanceOf(RangeError);
		for (const id of ["", "../BTC", "BTC?date=latest", " BTC"])
			await expect(provider.fetchQuotes(date, [id], "USD")).rejects.toBeInstanceOf(RangeError);
		expect(urls).toEqual([]);
		expect(await provider.fetchQuotes(date, [], "USD")).toEqual([]);
	});

	test("marks missing history unavailable with no latest fallback", async () => {
		const { provider, urls } = client({}, 404);
		try {
			await provider.fetchQuotes(date, ["BTC"], "USD");
			throw new Error("Expected unavailable history");
		} catch (error) {
			expect(error).toBeInstanceOf(AssetQuoteProviderError);
			expect((error as AssetQuoteProviderError).unavailable).toBe(true);
		}
		expect(urls).toHaveLength(1);
		expect(urls[0]).toContain(`?date=${date}`);
	});

	test("preserves retry-after without retrying", async () => {
		const { provider, urls } = client({}, 429, { "retry-after": "3" });
		await expect(provider.fetchQuotes(date, ["BTC"], "USD")).rejects.toMatchObject({
			retryAfterMs: 3000,
			unavailable: false,
		});
		expect(urls).toHaveLength(1);
	});

	test("sanitizes transport and JSON failures", async () => {
		for (const request of [
			async () => {
				throw new Error("sensitive transport details");
			},
			async () => new Response("not JSON"),
		]) {
			const provider = createCoinbaseAssetQuoteProvider({
				request: request as unknown as typeof fetch,
			});
			await expect(provider.fetchQuotes(date, ["BTC"], "USD")).rejects.toThrow(
				"Falha no transporte ou JSON Coinbase",
			);
		}
	});

	test("rejects invalid timeout configuration", () => {
		for (const timeoutMs of [0, -1, Number.POSITIVE_INFINITY, 1.5])
			expect(() => createCoinbaseAssetQuoteProvider({ timeoutMs })).toThrow(RangeError);
	});
});
