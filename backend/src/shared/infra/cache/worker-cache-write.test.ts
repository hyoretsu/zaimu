import { expect, test } from "bun:test";
import { withWorkerCacheWrite } from "./worker-cache-write";

test("fences before worker effects and finalizes only after transaction commit", async () => {
	const steps: string[] = [];
	const cache = {
		beginWrite: async () => {
			steps.push("fence");
			return "token";
		},
		finishWrite: async (_user: string, _namespaces: unknown, token?: string) => {
			expect(token).toBe("token");
			steps.push("invalidate");
		},
	};
	const result = await withWorkerCacheWrite(
		["user", "user"],
		["dashboard"],
		async () => {
			steps.push("effect and outbox");
			return 42;
		},
		cache,
		async operation => {
			steps.push("begin");
			const result = await operation();
			steps.push("commit");
			return result;
		},
	);
	expect(result).toBe(42);
	expect(steps).toEqual(["fence", "begin", "effect and outbox", "commit", "invalidate"]);
});

test("worker rollback retains lease without advancing generation", async () => {
	let invalidated = false;
	const cache = {
		beginWrite: async () => "token",
		finishWrite: async () => {
			invalidated = true;
		},
	};
	await expect(
		withWorkerCacheWrite(
			["user"],
			["dashboard"],
			async () => {
				throw new Error("rollback");
			},
			cache,
			operation => operation(),
		),
	).rejects.toThrow("rollback");
	expect(invalidated).toBe(false);
});
