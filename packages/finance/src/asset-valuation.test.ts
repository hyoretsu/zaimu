import { expect, test } from "bun:test";
import type { AssetQuote } from "./asset-quote-provider";
import {
	type AssetFxRate,
	AssetValuationError,
	type AssetValuationInput,
	createAssetValuationResolver,
} from "./asset-valuation";

const date = "2026-01-01";
const quote: AssetQuote = {
	assetCode: "ETH",
	date,
	price: "1",
	quoteCurrency: "USD",
	sourceTime: `${date}T00:00:00Z`,
};
const fx: AssetFxRate = { date, fromCurrency: "USD", rate: "1", toCurrency: "BRL" };
const input: AssetValuationInput = {
	assetCode: "ETH",
	date,
	preferredCurrency: "BRL",
	quantity: "1",
	quoteCurrency: "USD",
};
function resolver(price: AssetQuote | null = quote, rate: AssetFxRate | null = fx) {
	return createAssetValuationResolver({
		fx: { getRate: async () => rate },
		quotes: { getQuote: async () => price },
	});
}

test("resolves the exact date and both pairs through injected snapshots, keeping provenance", async () => {
	const calls: string[][] = [];
	const resolve = createAssetValuationResolver({
		fx: {
			getRate: async (...args) => {
				calls.push(args);
				return { ...fx, rate: "5.25" };
			},
		},
		quotes: {
			getQuote: async (...args) => {
				calls.push(args);
				return { ...quote, price: "2" };
			},
		},
	});
	const result = await resolve({
		...input,
		assetCode: "eth",
		preferredCurrency: "brl",
		quantity: "1.5",
		quoteCurrency: "usd",
	});
	expect(calls).toEqual([
		[date, "ETH", "USD"],
		[date, "USD", "BRL"],
	]);
	expect(result).toEqual({
		amount: "15.75",
		assetCode: "ETH",
		currency: "BRL",
		date,
		exactAmount: "15.75",
		fx: { ...fx, rate: "5.25" },
		quantity: "1.500000000000000000",
		quote: { ...quote, price: "2" },
		rounding: "HALF_AWAY_FROM_ZERO",
	});
});

test("multiplies 18-place quantity, price and FX exactly, retaining 54-place result", async () => {
	const result = await resolver(
		{ ...quote, price: "1.000000000000000001" },
		{ ...fx, rate: "1.000000000000000001" },
	)({ ...input, quantity: "1.000000000000000001" });
	expect(result.exactAmount).toBe("1.000000000000000003000000000000000003000000000000000001");
	expect(result.amount).toBe("1.00");
});

test("never converts a quantity above Number.MAX_SAFE_INTEGER through number", async () => {
	const result = await resolver()({ ...input, quantity: "9007199254740993.123456789012345678" });
	expect(result.quantity).toBe("9007199254740993.123456789012345678");
	expect(result.exactAmount).toBe("9007199254740993.123456789012345678");
	expect(result.amount).toBe("9007199254740993.12");
});

test("tiny products survive all 54 decimal places before final rounding", async () => {
	const result = await resolver(
		{ ...quote, price: "0.000000000000000001" },
		{ ...fx, rate: "0.000000000000000001" },
	)({ ...input, quantity: "0.000000000000000001" });
	expect(result.exactAmount).toBe(`0.${"0".repeat(53)}1`);
	expect(result.amount).toBe("0.00");
});

test("does not round the intermediate quote fiat amount", async () => {
	const result = await resolver({ ...quote, price: "0.004" }, { ...fx, rate: "1000" })(input);
	expect(result.amount).toBe("4.00");
	expect(result.exactAmount).toBe("4");
});

for (const [quantity, expected] of [
	["1.005", "1.01"],
	["-1.005", "-1.01"],
	["1.0049", "1.00"],
	["-0.004", "0.00"],
	["0", "0.00"],
]) {
	test(`explicit half-away-from-zero rounding: ${quantity} -> ${expected}`, async () => {
		expect((await resolver()({ ...input, quantity })).amount).toBe(expected);
	});
}

for (const [currency, price, expected] of [
	["JPY", "2.5", "3"],
	["KWD", "1.2345", "1.235"],
	["USD", "0.1", "0.10"],
]) {
	test(`uses ${currency} minor units and skips unnecessary FX`, async () => {
		const resolve = createAssetValuationResolver({
			fx: {
				getRate: async () => {
					throw new Error("FX must not be requested");
				},
			},
			quotes: { getQuote: async () => ({ ...quote, price, quoteCurrency: currency }) },
		});
		const result = await resolve({ ...input, preferredCurrency: currency, quoteCurrency: currency });
		expect(result.amount).toBe(expected);
		expect(result.fx).toBeNull();
	});
}

for (const [name, snapshot] of [
	["missing", null],
	["wrong date", { ...quote, date: "2026-01-02" }],
	["stale source", { ...quote, sourceTime: "2025-12-31T23:59:59Z" }],
	["invalid source", { ...quote, sourceTime: "bad" }],
	["wrong asset", { ...quote, assetCode: "BTC" }],
	["wrong quote fiat", { ...quote, quoteCurrency: "EUR" }],
] as const) {
	test(`rejects ${name} quote without substituting latest`, async () => {
		await expect(resolver(snapshot)(input)).rejects.toBeInstanceOf(AssetValuationError);
	});
}

for (const [name, snapshot] of [
	["missing", null],
	["wrong date", { ...fx, date: "2026-01-02" }],
	["reverse pair", { ...fx, fromCurrency: "BRL", toCurrency: "USD" }],
	["wrong target", { ...fx, toCurrency: "EUR" }],
	["zero", { ...fx, rate: "0" }],
	["negative", { ...fx, rate: "-1" }],
	["excess precision", { ...fx, rate: "0.1234567890123456789" }],
] as const) {
	test(`rejects ${name} FX snapshot`, async () => {
		await expect(resolver(quote, snapshot)(input)).rejects.toBeInstanceOf(AssetValuationError);
	});
}

for (const price of ["0", "-1", "NaN", "1e-18", "0.1234567890123456789", "100000000000000000000"]) {
	test(`rejects invalid decimal price ${price}`, async () => {
		await expect(resolver({ ...quote, price })(input)).rejects.toBeInstanceOf(AssetValuationError);
	});
}

test("validates calendar dates, asset precision and fiat denominations before snapshot access", async () => {
	let calls = 0;
	const resolve = createAssetValuationResolver({
		fx: { getRate: async () => fx },
		quotes: {
			getQuote: async () => {
				calls++;
				return quote;
			},
		},
	});
	for (const invalid of [
		{ date: "latest" },
		{ date: "2026-02-30" },
		{ assetCode: "BRL" },
		{ quoteCurrency: "ETH" },
		{ preferredCurrency: "BTC" },
		{ quantity: "0.0000000000000000001" },
		{ assetCode: "BTC", quantity: "0.123456789" },
	]) {
		await expect(resolve({ ...input, ...invalid })).rejects.toThrow();
	}
	expect(calls).toBe(0);
});

test("upstream JSON number precision is already lost and is never claimed recovered", async () => {
	const upstream = JSON.parse('{"price":0.123456789012345678}').price;
	const result = await resolver({ ...quote, price: String(upstream) })(input);
	expect(result.exactAmount).toBe("0.12345678901234568");
	expect(result.exactAmount).not.toBe("0.123456789012345678");
});

test("rejects numeric quantities, quote prices and FX at runtime", async () => {
	await expect(resolver()({ ...input, quantity: 1 as unknown as string })).rejects.toBeInstanceOf(
		AssetValuationError,
	);
	await expect(resolver({ ...quote, price: 1 as unknown as string })(input)).rejects.toBeInstanceOf(
		AssetValuationError,
	);
	await expect(resolver(quote, { ...fx, rate: 1 as unknown as string })(input)).rejects.toBeInstanceOf(
		AssetValuationError,
	);
});
