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

test("auth journey uses isolated session cookies, validates identity and keeps secrets out of reports", async () => {
	let authenticated = false;
	const original = ["fixture-original-session"];
	const requester = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const path = new URL(String(input)).pathname;
		if (path.endsWith("sign-in/email")) {
			authenticated = true;
			return Response.json(
				{ user: { email: "performance0@zaimu.local" } },
				{
					headers: { ...metricHeaders, "set-cookie": "test_session=private-session-value; Path=/; HttpOnly" },
				},
			);
		}
		expect(new Headers(init?.headers).get("cookie")).toBe("test_session=private-session-value");
		if (path.endsWith("sign-out")) {
			authenticated = false;
			return Response.json({ success: true }, { headers: metricHeaders });
		}
		return Response.json(authenticated ? { user: { email: "performance0@zaimu.local" } } : null, {
			headers: metricHeaders,
		});
	}) as typeof fetch;
	const report = await runMutationScenario("authSession", {
		authThinkTimeMs: 0,
		base: new URL("http://127.0.0.1:3335"),
		cookies: original,
		iterations: 2,
		load: 1,
		requester,
	});
	expect(report.passed).toBeTrue();
	expect(original).toEqual(["fixture-original-session"]);
	expect(report.actions.signIn?.count).toBe(2);
	expect(report.actions.signOut?.count).toBe(2);
	expect(JSON.stringify(report)).not.toContain("private-session-value");
});

test("wrong auth identity fails acceptance and closes the newly created session", async () => {
	let signedOut = 0;
	const requester = (async (input: Parameters<typeof fetch>[0]) => {
		const path = new URL(String(input)).pathname;
		if (path.endsWith("sign-out")) signedOut++;
		return Response.json(
			{ user: { email: "another-owner@zaimu.local" } },
			{ headers: { ...metricHeaders, "set-cookie": "test_session=wrong-owner; HttpOnly" } },
		);
	}) as typeof fetch;
	const report = await runMutationScenario("authSession", {
		authThinkTimeMs: 0,
		base: new URL("http://127.0.0.1:3335"),
		cookies: ["original"],
		iterations: 1,
		load: 1,
		requester,
	});
	expect(report.passed).toBeFalse();
	expect(signedOut).toBe(1);
});

test("transfer suggestion rejects cached pair and cleans both transactions and account", async () => {
	let rejected = false;
	const deleted: string[] = [];
	const requester = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const path = new URL(String(input)).pathname;
		if (init?.method === "DELETE") {
			deleted.push(path);
			return Response.json({}, { headers: metricHeaders });
		}
		if (path.endsWith("/reject")) {
			rejected = true;
			return Response.json({}, { headers: metricHeaders });
		}
		if (path === "/transactions/transfer-suggestions")
			return Response.json(
				rejected ? [] : [{ counterpart: { id: "income" }, transaction: { id: "expense" } }],
				{ headers: metricHeaders },
			);
		if (path === "/financial-accounts/") {
			const account = JSON.parse(String(init?.body));
			expect(account.countryCode).toBe("BR");
			return Response.json({ id: "destination" }, { headers: metricHeaders });
		}
		const body = JSON.parse(String(init?.body));
		return Response.json({ id: body.type === "EXPENSE" ? "expense" : "income" }, { headers: metricHeaders });
	}) as typeof fetch;
	const report = await runMutationScenario("transferSuggestion", {
		base: new URL("http://127.0.0.1:3335"),
		cookies: ["fixture"],
		iterations: 1,
		load: 1,
		requester,
	});
	expect(report.passed).toBeTrue();
	expect(report.actions.delete?.count).toBe(2);
	expect(deleted.sort()).toEqual([
		"/financial-accounts/destination",
		"/transactions/expense",
		"/transactions/income",
	]);
});
