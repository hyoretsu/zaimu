import { expect, test } from "bun:test";
import {
	assertDedicatedApi,
	captureRequest,
	completeMetrics,
	numericHeader,
	percentile,
	runConcurrent,
	selectScenarios,
} from "./runner";

test("selection and percentiles cannot falsely approve missing scenarios", () => {
	expect(() => selectScenarios(["purchase"], "")).toThrow();
	expect(() => selectScenarios(["purchase"], "unknown")).toThrow();
	expect(selectScenarios(["purchase"], " purchase,purchase ")).toEqual(["purchase"]);
	expect(() => percentile([], 0.95)).toThrow();
	expect(
		percentile(
			Array.from({ length: 100 }, (_, i) => i + 1),
			0.95,
		),
	).toBe(95);
});
test("invalid metrics and unsafe destinations fail", async () => {
	for (const value of ["", "NaN", "Infinity", "-1"])
		expect(numericHeader(new Response(null, { headers: { metric: value } }), "metric")).toBeNull();
	for (const url of [
		"https://example.com",
		"http://127.0.0.1:3333",
		"http://localhost:3335",
		"http://user@127.0.0.1:3335",
	])
		expect(() => assertDedicatedApi(new URL(url))).toThrow();
	const result = await captureRequest(new URL("http://127.0.0.1:3335/test"), {}, (async (
		_input: Parameters<typeof fetch>[0],
		init?: RequestInit,
	) => {
		expect(init?.redirect).toBe("error");
		expect(init?.signal).toBeDefined();
		return new Response("{}", { status: 500 });
	}) as unknown as typeof fetch);
	expect(result.sample.status).toBe(500);
	expect(completeMetrics(result.sample)).toBeFalse();
});
test("concurrency preserves all samples and respects fixed load", async () => {
	let active = 0,
		peak = 0;
	const results = await runConcurrent(25, 5, async index => {
		peak = Math.max(peak, ++active);
		await Bun.sleep(1);
		active--;
		return index;
	});
	expect(results).toEqual(Array.from({ length: 25 }, (_, i) => i));
	expect(peak).toBe(5);
});

test("controlled clock includes complete response and timeout failures cannot pass", async () => {
	let clock = 100;
	const result = await captureRequest(
		new URL("http://127.0.0.1:3335/test"),
		{},
		(async () => {
			clock += 10;
			return new Response(
				new ReadableStream({
					start(controller) {
						clock += 40;
						controller.enqueue(new TextEncoder().encode("{}"));
						controller.close();
					},
				}),
			);
		}) as unknown as typeof fetch,
		{ now: () => clock },
	);
	expect(result.sample.durationMs).toBe(50);
	const timedOut = await captureRequest(
		new URL("http://127.0.0.1:3335/test"),
		{},
		(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
			})) as unknown as typeof fetch,
		{ timeoutMs: 1 },
	);
	expect(timedOut.sample.status).toBe(0);
	expect(timedOut.sample.error).toBe("TimeoutError");
	expect(completeMetrics(timedOut.sample)).toBeFalse();
});
