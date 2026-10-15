import { expect, test } from "bun:test";
import { withWorkerCacheFence, withWorkerCacheWrite } from "./worker-cache-write";

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

test("download fence stays active until adapter finishes", async () => {
	const download = Promise.withResolvers<void>();
	const started = Promise.withResolvers<void>();
	let invalidated = false;
	const pending = withWorkerCacheFence(
		["user"],
		["dashboard"],
		async () => {
			started.resolve();
			await download.promise;
			return 42;
		},
		{
			beginWrite: async () => "token",
			finishWrite: async (_user, _namespaces, token) => {
				expect(token).toBe("token");
				invalidated = true;
			},
		},
	);
	await started.promise;
	expect(invalidated).toBe(false);
	download.resolve();
	expect(await pending).toBe(42);
	expect(invalidated).toBe(true);
});
