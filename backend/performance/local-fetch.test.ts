import { expect, test } from "bun:test";
import { createPerformanceFetch } from "./local-fetch";

test("simulates BCB weekdays without calling network and rejects other providers", async () => {
	let calls = 0;
	const original = Object.assign(
		async () => {
			calls++;
			return Response.json({});
		},
		{ preconnect: fetch.preconnect },
	) as typeof fetch;
	const guarded = createPerformanceFetch(original);
	const result = await guarded(
		"https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?dataInicial=02/10/2026&dataFinal=05/10/2026",
	);
	expect(await result.json()).toEqual([
		{ data: "02/10/2026", valor: "0.04" },
		{ data: "05/10/2026", valor: "0.04" },
	]);
	await expect(guarded("https://example.com")).rejects.toThrow("External HTTP blocked");
	await expect(guarded("https://api.bcb.gov.br/unexpected")).rejects.toThrow("External HTTP blocked");
	expect(calls).toBe(0);
});

test("local requests cannot follow external redirects and preserve method and body", async () => {
	let seen: Request | undefined;
	const original = Object.assign(
		async (input: Parameters<typeof fetch>[0]) => {
			seen = input instanceof Request ? new Request(input) : new Request(String(input));
			return Response.json({});
		},
		{ preconnect: fetch.preconnect },
	) as typeof fetch;
	await createPerformanceFetch(original)("http://127.0.0.1:3335/test", {
		body: "fixture",
		method: "POST",
		redirect: "follow",
	});
	expect(seen?.redirect).toBe("error");
	expect(seen?.method).toBe("POST");
	expect(await seen?.text()).toBe("fixture");
});

test("currency snapshots use deterministic local rates without external network", async () => {
	let calls = 0;
	const original = Object.assign(
		async () => {
			calls++;
			return Response.json({});
		},
		{ preconnect: fetch.preconnect },
	) as typeof fetch;
	const guarded = createPerformanceFetch(original);
	const response = await guarded(
		"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-04/v1/currencies/usd.json",
	);
	expect(await response.json()).toEqual({ date: "2026-10-04", usd: { brl: 5, eur: 0.9, jpy: 150, usd: 1 } });
	expect(calls).toBe(0);
	await expect(guarded("https://cdn.jsdelivr.net/unrelated")).rejects.toThrow("External HTTP blocked");
});
