import { expect, test } from "bun:test";
import { assertLocalHttpRequest } from "./network";

test("provider HTTP cannot leave local test fixtures", () => {
	for (const url of ["http://127.0.0.1:3333", "http://localhost:5173", "http://[::1]:3333"])
		expect(() => assertLocalHttpRequest(url)).not.toThrow();
	for (const url of ["https://api.example.com", "http://192.168.1.10", "file:///tmp/test"])
		expect(() => assertLocalHttpRequest(url)).toThrow("External HTTP disabled");
	expect(() => fetch("https://api.example.com")).toThrow("External HTTP disabled");
	expect(() => fetch.preconnect("https://api.example.com")).toThrow("External HTTP disabled");
});

test("supported currency catalog uses a deterministic local provider double", async () => {
	const response = await fetch(
		"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json",
	);
	expect(await response.json()).toMatchObject({ brl: "BRL", jpy: "JPY", kwd: "KWD", usd: "USD" });
});
