import { expect, test } from "bun:test";
import { clientGateway } from "./gateway";

const gateway = clientGateway("fixture", ["http://localhost:5173"]);
const request = (body: string, origin = "http://localhost:5173") =>
	new Request("http://localhost/telemetry/traces", {
		body,
		headers: { "content-type": "application/json", origin },
		method: "POST",
	});
process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??= "http://127.0.0.1:1";
test("client ingress rejects untrusted origins and oversized or arbitrary OTLP", async () => {
	expect((await gateway(request("{}", "https://untrusted.example"))).status).toBe(403);
	expect((await gateway(request("x".repeat(65537)))).status).toBe(400);
	expect(
		(
			await gateway(
				request(
					JSON.stringify({
						resourceSpans: [
							{
								resource: {
									attributes: [{ key: "service.name", value: { stringValue: "private" } }],
								},
								scopeSpans: [],
							},
						],
					}),
				),
			)
		).status,
	).toBe(400);
});
test("client ingress bounds frequency", async () => {
	let response: Response | undefined;
	for (let i = 0; i < 31; i++) response = await gateway(request("{}"), "rate-fixture");
	expect(response!.status).toBe(429);
});

test("client ingress preserves bounded resource identity and strips private attributes", async () => {
	const { clientGateway } = await import("./gateway");
	const receive = clientGateway("fixture", ["http://localhost:5173"]);
	const original = globalThis.fetch;
	let forwarded = "";
	globalThis.fetch = Object.assign(async (_input: unknown, init?: RequestInit) => {
		forwarded = String(init?.body);
		return new Response("{}", { status: 200 });
	}, original) as typeof fetch;
	const instance = crypto.randomUUID();
	try {
		const response = await receive(
			new Request("http://localhost/telemetry/traces", {
				body: JSON.stringify({
					resourceSpans: [
						{
							resource: {
								attributes: [
									{ key: "service.name", value: { stringValue: "fixture-web" } },
									{ key: "service.instance.id", value: { stringValue: instance } },
									{ key: "private", value: { stringValue: "private-resource-secret" } },
								],
							},
							scopeSpans: [
								{
									spans: [
										{
											attributes: [
												{
													key: "http.url",
													value: { stringValue: "private-request-secret" },
												},
											],
											endTimeUnixNano: "1700000001000000000",
											name: "client.fetch",
											spanId: "2".repeat(16),
											startTimeUnixNano: "1700000000000000000",
											traceId: "1".repeat(32),
										},
									],
								},
							],
						},
					],
				}),
				headers: { "content-type": "application/json", origin: "http://localhost:5173" },
				method: "POST",
			}),
			crypto.randomUUID(),
		);
		expect(response.status).toBe(200);
		expect(forwarded).toContain(instance);
		expect(forwarded).not.toContain("private-resource-secret");
		expect(forwarded).not.toContain("private-request-secret");
	} finally {
		globalThis.fetch = original;
	}
});
