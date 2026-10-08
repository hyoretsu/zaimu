import { expect, test } from "bun:test";
import { CurrencyProviderError, fetchCurrencySnapshot } from "./currency-provider";

test("official mirror fallback handles bad historical payload and preserves publication date", async () => {
	const urls: string[] = [];
	const request = (async (url: string | URL | Request) => {
		urls.push(String(url));
		return Response.json({
			date: urls.length === 1 ? "2026-01-02" : "2026-01-01",
			usd: { brl: 5, usd: 1 },
		});
	}) as unknown as typeof fetch;
	expect((await fetchCurrencySnapshot("2026-01-01", "USD", request)).rates.BRL).toBe(5);
	expect(urls[1]).toBe("https://2026-01-01.currency-api.pages.dev/v1/currencies/usd.json");
});
test("latest is stored under actual published date and retry-after survives both provider failures", async () => {
	const latest = await fetchCurrencySnapshot("latest", "USD", (async () =>
		Response.json({ date: "2026-01-01", usd: { brl: 5, usd: 1 } })) as unknown as typeof fetch);
	expect(latest.date).toBe("2026-01-01");
	try {
		await fetchCurrencySnapshot(
			"2026-01-01",
			"USD",
			(async () =>
				new Response(null, {
					headers: { "retry-after": "120" },
					status: 429,
				})) as unknown as typeof fetch,
		);
	} catch (error) {
		expect(error).toBeInstanceOf(CurrencyProviderError);
		expect((error as CurrencyProviderError).retryAfterMs).toBe(120_000);
		return;
	}
	throw new Error("Expected provider failure");
});
