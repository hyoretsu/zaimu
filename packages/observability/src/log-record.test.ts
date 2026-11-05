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
