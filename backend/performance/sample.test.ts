import { expect, test } from "bun:test";
import { measureRequest } from "./sample";

test("request timing includes receiving the complete response body", async () => {
	const request = async () =>
		new Response(
			new ReadableStream({
				async start(controller) {
					await Bun.sleep(40);
					controller.enqueue(new TextEncoder().encode("{}"));
					controller.close();
				},
			}),
			{ headers: { "x-performance-query-count": "4", "x-performance-sql-duration-ms": "12.5" } },
		);
	const result = await measureRequest(new URL("http://127.0.0.1/dashboard/"), "session=test", request);
	expect(result.durationMs).toBeGreaterThanOrEqual(35);
	expect(result.queryCount).toBe(4);
	expect(result.sqlDurationMs).toBe(12.5);
});

test("missing SQL metrics cannot be mistaken for a zero-query cache hit", async () => {
	const request = async () => new Response("{}");
	const result = await measureRequest(new URL("http://127.0.0.1/dashboard/"), "session=test", request);
	expect(result.queryCount).toBeNull();
	expect(result.sqlDurationMs).toBeNull();
});
