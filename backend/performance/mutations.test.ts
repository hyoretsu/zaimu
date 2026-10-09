import { expect, test } from "bun:test";
import { runMutationScenario } from "./mutations";

const metricHeaders = {
	"x-performance-auth-query-count": "0",
	"x-performance-business-query-count": "1",
	"x-performance-connection-wait-ms": "0",
	"x-performance-query-count": "1",
	"x-performance-request-id": "fixture-request",
	"x-performance-sql-duration-ms": "1",
	"x-performance-sql-elapsed-ms": "1",
};

test("failed financial assertions still clean up every created purchase and fail report", async () => {
	let deletes = 0;
	const requester = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		if (init?.method === "DELETE") {
			deletes++;
			return Response.json({ success: true }, { headers: metricHeaders });
		}
		return Response.json(
			[
				{ id: "created", purchaseId: "created" },
				{ id: "unexpected", purchaseId: "created" },
			],
			{ headers: metricHeaders },
		);
	}) as unknown as typeof fetch;
	const report = await runMutationScenario("purchase", {
		base: new URL("http://127.0.0.1:3335"),
		cookies: ["fixture"],
		iterations: 3,
		load: 1,
		requester,
	});
	expect(deletes).toBe(3);
	expect(report.errors).toHaveLength(3);
	expect(report.actions.create?.count).toBe(3);
	expect(report.actions.delete?.count).toBe(3);
	expect(report.passed).toBeFalse();
});

test("HTTP success without required telemetry cannot pass mutation acceptance", async () => {
	const requester = (async () => Response.json({ preferredCurrency: "BRL" })) as unknown as typeof fetch;
	const report = await runMutationScenario("currencyPreference", {
		base: new URL("http://127.0.0.1:3335"),
		cookies: ["fixture"],
		iterations: 3,
		load: 1,
		requester,
	});
	expect(report.errors).toHaveLength(0);
	expect(report.passed).toBeFalse();
});
