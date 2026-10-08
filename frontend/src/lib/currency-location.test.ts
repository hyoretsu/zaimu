import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { detectCurrencyLocation } from "./currency-location";

const key = "zaimu:device-currency-location:v1";
const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalFetch = globalThis.fetch;
let values: Map<string, string>;
beforeEach(() => {
	values = new Map();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		},
	});
});
afterEach(() => {
	globalThis.fetch = originalFetch;
	if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
	else Reflect.deleteProperty(globalThis, "localStorage");
});
test("seven-day device cache reuses location without provider calls", async () => {
	values.set(key, JSON.stringify({ country: "JP", currency: "JPY", detectedAt: Date.now() - 6 * 86400000 }));
	const fetchMock = mock(async () => {
		throw new Error("Unexpected request");
	});
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	expect(await detectCurrencyLocation(["USD", "JPY"])).toMatchObject({ country: "JP", currency: "JPY" });
	expect(fetchMock).not.toHaveBeenCalled();
});
test("expired detection deduplicates requests and caches new travel country", async () => {
	values.set(key, JSON.stringify({ country: "US", currency: "USD", detectedAt: Date.now() - 8 * 86400000 }));
	let resolve!: (value: Response) => void;
	const response = new Promise<Response>(callback => {
		resolve = callback;
	});
	const fetchMock = mock(() => response);
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	const first = detectCurrencyLocation(["USD", "JPY"]);
	const second = detectCurrencyLocation(["USD", "JPY"]);
	expect(first).toBe(second);
	resolve(Response.json({ country_code: "JP" }));
	expect(await first).toMatchObject({ country: "JP", currency: "JPY" });
	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(JSON.parse(values.get(key)!)).toMatchObject({ country: "JP", currency: "JPY" });
});
test("provider failure keeps detection unavailable without fabricated cache", async () => {
	globalThis.fetch = mock(async () => new Response("", { status: 429 })) as unknown as typeof fetch;
	expect(await detectCurrencyLocation(["USD"])).toBeNull();
	expect(values.has(key)).toBe(false);
});
