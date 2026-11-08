import { describe, expect, test } from "bun:test";
import { createAssetQuoteService } from "./asset-quotes";

describe("asset quote snapshots", () => {
	test("deduplicates exact historical requests and persists decimal text", async () => {
		let calls = 0;
		const quote = {
			assetCode: "BTC",
			date: "2026-10-01",
			price: "100000.123456789123456789",
			quoteCurrency: "USD",
			sourceTime: "2026-10-01T00:00:00Z",
		};
		const get = createAssetQuoteService({
			identity: async () => "brapi:BTC",
			provider: () => ({
				assetId: "BTC",
				client: {
					async fetchQuotes() {
						calls++;
						return [quote];
					},
				},
			}),
			store: { find: async () => null, save: async value => value },
		});
		const [first, second] = await Promise.all([
			get(quote.date, "BTC", "USD"),
			get(quote.date, "BTC", "USD"),
		]);
		expect(first.price).toBe(quote.price);
		expect(second).toEqual(first);
		expect(calls).toBe(1);
	});
	test("never substitutes a current quote for missing historical data", async () => {
		let saved = false;
		const get = createAssetQuoteService({
			identity: async () => "brapi:BTC",
			provider: () => ({
				assetId: "BTC",
				client: {
					async fetchQuotes() {
						return [
							{
								assetCode: "BTC",
								date: "2026-11-05",
								price: "1",
								quoteCurrency: "USD",
								sourceTime: "2026-11-05T00:00:00Z",
							},
						];
					},
				},
			}),
			store: {
				find: async () => null,
				save: async value => {
					saved = true;
					return value;
				},
			},
		});
		await expect(get("2026-10-01", "BTC", "USD")).rejects.toThrow("indisponível");
		expect(saved).toBe(false);
	});
	test("does not infer a provider mapping from a ticker", async () => {
		const get = createAssetQuoteService({
			identity: async () => null,
			provider: () => {
				throw new Error("must not fetch");
			},
			store: { find: async () => null, save: async value => value },
		});
		await expect(get("2026-10-01", "MUSD", "USD")).rejects.toThrow("indisponível");
	});
});
