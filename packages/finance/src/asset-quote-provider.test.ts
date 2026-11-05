import { expect, test } from "bun:test";
import { AssetQuoteProviderError, createBrapiAssetQuoteProvider } from "./asset-quote-provider";

const time = "2026-02-08T16:24:00.000Z";
const coin = (code = "BTC", price: unknown = 371028.28) => ({
	coin: code,
	currency: "BRL",
	regularMarketPrice: price,
	regularMarketTime: time,
});
function provider(payload: unknown) {
	return createBrapiAssetQuoteProvider({
		request: (async () => Response.json(payload)) as unknown as typeof fetch,
		token: "fake-test-token",
	});
}

test("deduplicates a whole batch, sends Bearer and currency, preserves source time and input order", async () => {
	let calls = 0;
	const quotes = createBrapiAssetQuoteProvider({
		request: (async (input: string | URL | Request, options?: RequestInit) => {
			calls++;
			const url = new URL(String(input));
			expect(url.origin + url.pathname).toBe("https://brapi.dev/api/v2/crypto");
			expect(url.searchParams.get("coin")).toBe("BTC,ETH");
			expect(url.searchParams.get("currency")).toBe("BRL");
			expect(url.searchParams.has("startDate")).toBe(false);
			expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer fake-test-token");
			expect(options?.signal).toBeInstanceOf(AbortSignal);
			return Response.json({ coins: [coin("ETH", 12), coin()] });
		}) as unknown as typeof fetch,
		token: "fake-test-token",
	});
	expect(await quotes.fetchQuotes("latest", ["btc", "ETH", "BTC"], "brl")).toEqual([
		{ assetCode: "BTC", date: "2026-02-08", price: "371028.28", quoteCurrency: "BRL", sourceTime: time },
		{ assetCode: "ETH", date: "2026-02-08", price: "12", quoteCurrency: "BRL", sourceTime: time },
	]);
	expect(calls).toBe(1);
});

test("historical request uses exact UTC day close, never the current quote", async () => {
	const date = "2026-01-01";
	const quotes = createBrapiAssetQuoteProvider({
		request: (async (input: string | URL | Request) => {
			const url = new URL(String(input));
			expect(url.searchParams.get("startDate")).toBe(date);
			expect(url.searchParams.get("endDate")).toBe(date);
			expect(url.searchParams.get("interval")).toBe("1d");
			expect(url.searchParams.has("range")).toBe(false);
			return Response.json({
				coins: [
					{ ...coin(), historicalDataPrice: [{ close: "0.123456789012345678", date: 1767225600 }] },
				],
			});
		}) as unknown as typeof fetch,
		token: "fake",
	});
	expect((await quotes.fetchQuotes(date, ["BTC"], "BRL"))[0]).toEqual({
		assetCode: "BTC",
		date,
		price: "0.123456789012345678",
		quoteCurrency: "BRL",
		sourceTime: "2026-01-01T00:00:00.000Z",
	});
});

for (const history of [
	undefined,
	[],
	[{ close: 10, date: 1767312000 }],
	[{ close: null, date: 1767225600 }],
	[
		{ close: 1, date: 1767225600 },
		{ close: 2, date: 1767225600 },
	],
]) {
	test(`missing, null, wrong-day or ambiguous history rejects: ${JSON.stringify(history)}`, async () => {
		await expect(
			provider({ coins: [{ ...coin(), historicalDataPrice: history }] }).fetchQuotes(
				"2026-01-01",
				["BTC"],
				"BRL",
			),
		).rejects.toBeInstanceOf(AssetQuoteProviderError);
	});
}

for (const status of [400, 401, 403, 404, 429, 500, 503]) {
	test(`HTTP ${status} fails the batch without retry`, async () => {
		let calls = 0;
		const quotes = createBrapiAssetQuoteProvider({
			request: (async () => {
				calls++;
				return new Response("private upstream message", {
					headers: { "retry-after": "120" },
					status,
				});
			}) as unknown as typeof fetch,
			token: "fake",
		});
		try {
			await quotes.fetchQuotes("latest", ["BTC", "UNKNOWN"], "BRL");
			throw new Error("Expected failure");
		} catch (error) {
			expect(error).toBeInstanceOf(AssetQuoteProviderError);
			expect((error as AssetQuoteProviderError).retryAfterMs).toBe(120000);
			expect((error as Error).message).toBe(`brapi HTTP ${status}`);
		}
		expect(calls).toBe(1);
	});
}

for (const payload of [
	null,
	[],
	{},
	{ coins: {} },
	{ coins: [] },
	{ coins: [coin("ETH")] },
	{ coins: [coin(), coin()] },
	{ coins: [{ ...coin(), currency: "USD" }] },
	{ coins: [{ ...coin(), regularMarketTime: "invalid" }] },
]) {
	test(`malformed or incomplete batch rejects: ${JSON.stringify(payload)}`, async () => {
		await expect(provider(payload).fetchQuotes("latest", ["BTC"], "BRL")).rejects.toBeInstanceOf(
			AssetQuoteProviderError,
		);
	});
}

for (const price of [
	0,
	-1,
	null,
	"NaN",
	"Infinity",
	"1.0000000000000000001",
	"100000000000000000000",
	"0",
	"-1",
	true,
]) {
	test(`invalid or excessive price precision rejects: ${price}`, async () => {
		await expect(
			provider({ coins: [coin("BTC", price)] }).fetchQuotes("latest", ["BTC"], "BRL"),
		).rejects.toBeInstanceOf(AssetQuoteProviderError);
	});
}

test("decimal strings retain all 18 places, including values above safe integer", async () => {
	for (const price of ["0.000000000000000001", "99999999999999999999.123456789012345678"]) {
		expect(
			(await provider({ coins: [coin("BTC", price)] }).fetchQuotes("latest", ["BTC"], "BRL"))[0].price,
		).toBe(price);
	}
});

test("numeric JSON is expanded without claiming to restore rounded digits", async () => {
	expect(
		(await provider({ coins: [coin("BTC", 1e-18)] }).fetchQuotes("latest", ["BTC"], "BRL"))[0].price,
	).toBe("0.000000000000000001");
	const rounded = JSON.parse('{"price":0.123456789012345678}').price;
	expect(
		(await provider({ coins: [coin("BTC", rounded)] }).fetchQuotes("latest", ["BTC"], "BRL"))[0].price,
	).toBe("0.12345678901234568");
});

test("empty batch skips fetch; invalid inputs fail before transport", async () => {
	const quotes = createBrapiAssetQuoteProvider({
		request: (async () => {
			throw new Error("must not fetch");
		}) as unknown as typeof fetch,
		token: "fake",
	});
	expect(await quotes.fetchQuotes("latest", [], "BRL")).toEqual([]);
	for (const date of ["2026-02-30", "bad"])
		await expect(quotes.fetchQuotes(date, ["BTC"], "BRL")).rejects.toBeInstanceOf(RangeError);
	await expect(quotes.fetchQuotes("latest", ["BTC,ETH"], "BRL")).rejects.toBeInstanceOf(RangeError);
	expect(() => createBrapiAssetQuoteProvider({ token: "" })).toThrow(RangeError);
});

test("timeout aborts transport and malformed JSON gets a sanitized provider error", async () => {
	const quotes = createBrapiAssetQuoteProvider({
		request: ((_input: string | URL | Request, options?: RequestInit) =>
			new Promise((_resolve, reject) => {
				const signal = options?.signal;
				signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
			})) as unknown as typeof fetch,
		timeoutMs: 5,
		token: "fake",
	});
	await expect(quotes.fetchQuotes("latest", ["BTC"], "BRL")).rejects.toBeInstanceOf(
		AssetQuoteProviderError,
	);
	const broken = createBrapiAssetQuoteProvider({
		request: (async () => new Response("{broken")) as unknown as typeof fetch,
		token: "fake",
	});
	await expect(broken.fetchQuotes("latest", ["BTC"], "BRL")).rejects.toThrow(
		"Falha no transporte ou JSON brapi",
	);
});
