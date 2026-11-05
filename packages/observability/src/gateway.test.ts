import { expect, test } from "bun:test";
import { clientGateway } from "./gateway";

const gateway = clientGateway("fixture", ["http://localhost:5173"]);
const request = (body: string, origin = "http://localhost:5173") =>
	new Request("http://localhost/telemetry/traces", {
		body,
		headers: { "content-type": "application/json", origin },
		method: "POST",
	});
process.env.OTEL_ENABLED = "true";
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
