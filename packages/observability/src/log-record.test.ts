import { expect, test } from "bun:test";
import { operationalLog } from "./log-record";
test("operational logs preserve event type without exporting private values", () => {
	const record = operationalLog([
		JSON.stringify({
			amount: 999,
			message: "secret token",
			method: "POST",
			status: 200,
			type: "http_request",
			url: "https://bank.example/private",
		}),
	]);
	expect(record.body).toBe("http_request");
	expect(record.attributes["log.summary"]).toContain("POST");
	expect(JSON.stringify(record)).not.toContain("secret token");
	expect(JSON.stringify(record)).not.toContain("bank.example");
	expect(JSON.stringify(record)).not.toContain("999");
	expect(operationalLog(["secret token"]).body).toBe("application.log");
});

test("structured diagnostics retain the benchmark contract and reject private fields", () => {
	const requestId = "11111111-1111-4111-8111-111111111111";
	const record = operationalLog([
		JSON.stringify({
			amount: 999,
			completed: true,
			cpuMicros: { system: 2, token: "secret", user: 1 },
			eventLoopLagP95Ms: 0,
			memory: { arrayBuffers: 1, external: 1, heapTotal: 8, heapUsed: 4, rss: 10 },
			pool: { idle: 1, total: 2, waiting: 0 },
			queryCount: 2,
			requestId,
			route: "/private-id",
			spans: [{ durationMs: 2, name: "sql:SELECT", parameters: ["private"], startMs: 1 }],
			type: "http_request",
		}),
	]);
	expect(record.fields).toMatchObject({
		completed: true,
		cpuMicros: { system: 2, user: 1 },
		queryCount: 2,
		requestId,
		spans: [{ durationMs: 2, name: "sql:SELECT", outcome: "ok", startMs: 1 }],
		type: "http_request",
	});
	expect(JSON.stringify(record.fields)).not.toMatch(/secret|private|999|parameters/);
	expect(() =>
		operationalLog([JSON.stringify({ method: { toString: "invalid" }, type: "http_request" })]),
	).not.toThrow();
});
