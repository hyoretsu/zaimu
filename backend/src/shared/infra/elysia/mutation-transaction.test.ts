import { expect, test } from "bun:test";
import { afterMutationCommit, runMutationRequest } from "./mutation-transaction";

test("cache fences finish only after the SQL commit", async () => {
	const order: string[] = [];
	const response = await runMutationRequest(
		async () => {
			order.push("mutation", "outbox");
			afterMutationCommit(async () => {
				order.push("fence");
			});
			return new Response("ok");
		},
		async operation => {
			const result = await operation();
			order.push("commit");
			return result;
		},
	);
	expect(response.status).toBe(200);
	expect(order).toEqual(["mutation", "outbox", "commit", "fence"]);
});

test("HTTP errors roll back and preserve fence leases", async () => {
	const order: string[] = [];
	const response = await runMutationRequest(
		async () => {
			afterMutationCommit(async () => {
				order.push("fence");
			});
			return new Response("failed", { status: 409 });
		},
		async operation => {
			try {
				return await operation();
			} catch (error) {
				order.push("rollback");
				throw error;
			}
		},
	);
	expect(response.status).toBe(409);
	expect(order).toEqual(["rollback"]);
});

test("failed SQL commit never finalizes fences", async () => {
	let finalized = false;
	await expect(
		runMutationRequest(
			async () => {
				afterMutationCommit(async () => {
					finalized = true;
				});
				return new Response("ok");
			},
			async operation => {
				await operation();
				throw new Error("commit failed");
			},
		),
	).rejects.toThrow("commit failed");
	expect(finalized).toBe(false);
});

test("Elysia wrapper retains request context through response mapping", async () => {
	const { default: Elysia } = await import("elysia");
	const order: string[] = [];
	const app = new Elysia()
		.wrap(
			(handler, request) => async () =>
				runMutationRequest(
					async () => (await handler(request)) as unknown as Response,
					async operation => {
						const result = await operation();
						order.push("commit");
						return result;
					},
				),
		)
		.post("/mutation", () => {
			order.push("mutation");
			afterMutationCommit(async () => {
				order.push("fence");
			});
			return { id: "created" };
		});
	const response = await app.handle(new Request("http://localhost/mutation", { method: "POST" }));
	expect(await response.json()).toEqual({ id: "created" });
	expect(order).toEqual(["mutation", "commit", "fence"]);
});
