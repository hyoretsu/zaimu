import { expect, test } from "bun:test";
import Elysia from "elysia";
import { BATCH_MAX_BYTES } from "../../../../../../shared/batch-policy";
import type { BatchResult } from "../../dtos/BatchDTO";
import { createBatchController } from "./BatchController";

const request = (operations: unknown[], headers: Record<string, string> = {}) =>
	new Request("http://localhost/batch", {
		body: JSON.stringify({ operations }),
		headers: { "content-type": "application/json", ...headers },
		method: "POST",
	});
const action = (id: string, path = `/transactions/${id}`, method = "DELETE") => ({ id, method, path });

test("dispatches in order, preserves context, returns independent failures and continues", async () => {
	const seen: string[] = [];
	const inherited: Request[] = [];
	const app = new Elysia().use(
		createBatchController(
			async child => {
				seen.push(new URL(child.url).pathname);
				expect(child.headers.get("cookie")).toBe("session=owner");
				expect(child.headers.get("x-currency")).toBe("BRL");
				expect(child.headers.get("x-unsafe")).toBeNull();
				if (child.url.endsWith("/b")) return Response.json({ error: "Forbidden" }, { status: 403 });
				if (child.url.endsWith("/c")) throw new Error("private failure");
				return new Response(null, { status: 204 });
			},
			(_parent, child) => {
				inherited.push(child);
			},
		),
	);
	const response = await app.handle(
		request([action("a"), action("b"), action("c"), action("d")], {
			cookie: "session=owner",
			"x-currency": "BRL",
			"x-unsafe": "ignored",
		}),
	);
	expect(response.status).toBe(200);
	expect(
		((await response.json()) as BatchResult).results.map((result: { status: number }) => result.status),
	).toEqual([204, 403, 500, 204]);
	expect(seen).toEqual(["/transactions/a", "/transactions/b", "/transactions/c", "/transactions/d"]);
	expect(inherited).toHaveLength(4);
});

test("rejects external, recursive, encoded, upload, auth and unregistered operations", async () => {
	let calls = 0;
	const app = new Elysia().use(
		createBatchController(
			() => {
				calls++;
				return Response.json({});
			},
			() => {},
		),
	);
	const paths = [
		"https://example.com/transactions/a",
		"//example.com/a",
		"/batch",
		"/api/auth/sign-out",
		"/credit-card-imports",
		"/transactions/a/../b",
		"/transactions/%2fb",
		"/transactions/a?userId=other",
	];
	const response = await app.handle(request(paths.map((path, index) => action(String(index), path))));
	expect(response.status).toBe(200);
	expect(
		((await response.json()) as BatchResult).results.every(
			(result: { status: number }) => result.status === 400,
		),
	).toBe(true);
	expect(calls).toBe(0);
});

test("validates envelope count, duplicate IDs and per-operation credentials", async () => {
	const app = new Elysia().use(
		createBatchController(
			() => Response.json({}),
			() => {},
		),
	);
	for (const operations of [
		[],
		Array.from({ length: 51 }, (_, i) => action(String(i))),
		[action("a"), action("a")],
	]) {
		expect((await app.handle(request(operations))).status).toBe(422);
	}
	const response = await app.handle(request([{ ...action("a"), headers: { authorization: "spoof" } }]));
	// Reject credentials before Elysia can strip unknown properties.
	expect(response.status).toBe(422);
});

test("bounds actual streamed bytes including whitespace before dispatch", async () => {
	let calls = 0;
	const app = new Elysia().use(
		createBatchController(
			() => {
				calls++;
				return Response.json({});
			},
			() => {},
		),
	);
	const response = await app.handle(
		new Request("http://localhost/batch", {
			body: " ".repeat(BATCH_MAX_BYTES) + JSON.stringify({ operations: [action("a")] }),
			headers: { "content-type": "application/json" },
			method: "POST",
		}),
	);
	expect(response.status).toBe(413);
	expect(calls).toBe(0);
});

test("normal route authorization and validation execute for every operation", async () => {
	const app = new Elysia().delete("/transactions/:id", ({ params, request, status }) => {
		if (params.id === "other" || request.headers.get("cookie") !== "owner")
			return status(403, { error: "Forbidden" });
		return { deleted: params.id };
	});
	app.use(
		createBatchController(
			child => app.handle(child),
			() => {},
		),
	);
	const response = await app.handle(request([action("mine"), action("other")], { cookie: "owner" }));
	expect(((await response.json()) as BatchResult).results).toEqual([
		{ data: { deleted: "mine" }, id: "mine", status: 200 },
		{ data: { error: "Forbidden" }, id: "other", status: 403 },
	]);
});

test("each child commits or rolls back independently and runs commit effects only on success", async () => {
	const { runMutationRequest, afterMutationCommit } =
		await import("~/shared/infra/elysia/mutation-transaction");
	const persisted: string[] = [];
	const effects: string[] = [];
	const app = new Elysia()
		.wrap((handler, req) => async () => {
			const handle = async () => (await handler(req)) as unknown as Response;
			if (new URL(req.url).pathname === "/batch") return handle();
			return runMutationRequest(handle, async operation => {
				const previous = [...persisted];
				try {
					return await operation();
				} catch (error) {
					persisted.splice(0, persisted.length, ...previous);
					throw error;
				}
			});
		})
		.delete("/transactions/:id", ({ params }) => {
			persisted.push(params.id);
			afterMutationCommit(async () => {
				effects.push(params.id);
			});
			return params.id === "bad"
				? Response.json({ error: "failed" }, { status: 409 })
				: Response.json({ deleted: params.id });
		});
	app.use(
		createBatchController(
			child => app.handle(child),
			() => {},
		),
	);
	const response = await app.handle(request([action("a"), action("bad"), action("b")]));
	expect(
		((await response.json()) as BatchResult).results.map((result: { status: number }) => result.status),
	).toEqual([200, 409, 200]);
	expect(persisted).toEqual(["a", "b"]);
	expect(effects).toEqual(["a", "b"]);
});
