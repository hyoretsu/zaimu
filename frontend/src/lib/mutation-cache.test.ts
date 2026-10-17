import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

if (!globalThis.window)
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
const { configureMutationInvalidation } = await import("./mutation-cache");
const { queryKeys } = await import("./query-cache");

import type { CacheIdentity } from "./query-cache";

describe("mutation cache policies", () => {
	it("invalidates each related domain after persisted local work", async () => {
		const client = new QueryClient();
		const identity: CacheIdentity = "guest:test";
		configureMutationInvalidation(client, { currency: () => "BRL", identity: () => identity });
		const accounts = queryKeys.accounts.list(identity);
		const transactions = [...queryKeys.transactions.all(identity), "list"];
		const unrelated = queryKeys.stores.all(identity);
		for (const key of [accounts, transactions, unrelated]) client.setQueryData(key, []);
		let persisted = false;
		const mutation = client.getMutationCache().build(client, {
			meta: { awaitRefetch: true, cacheOperations: ["transaction"] },
			mutationFn: async () => {
				persisted = true;
			},
		});
		await mutation.execute(undefined);
		expect(persisted).toBe(true);
		expect(client.getQueryState(accounts)?.isInvalidated).toBe(true);
		expect(client.getQueryState(transactions)?.isInvalidated).toBe(true);
		expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
		client.clear();
	});
	it("does not interpret record IDs as currencies", async () => {
		const client = new QueryClient();
		const identity: CacheIdentity = "user:test";
		configureMutationInvalidation(client, { currency: () => "BRL", identity: () => identity });
		const key = queryKeys.accountYields.list(identity, "USD");
		client.setQueryData(key, []);
		await client
			.getMutationCache()
			.build(client, {
				meta: { awaitRefetch: true, cacheOperations: ["account"] },
				mutationFn: async () => undefined,
			})
			.execute(undefined);
		expect(client.getQueryState(key)?.isInvalidated).toBe(true);
		client.clear();
	});
	it("isolates identities and currencies", async () => {
		const client = new QueryClient();
		let identity: CacheIdentity = "user:first";
		configureMutationInvalidation(client, { currency: () => "BRL", identity: () => identity });
		const first = queryKeys.dashboard.detail(identity, {});
		// Explicit currency tuples preserve the same dashboard key dimensions.
		const brl = [first[0], first[1], first[2], first[3], "BRL", first[5]];
		const usd = [first[0], first[1], first[2], first[3], "USD", first[5]];
		const other = queryKeys.accounts.list("user:second");
		for (const key of [brl, usd, other]) client.setQueryData(key, []);
		await client
			.getMutationCache()
			.build(client, {
				meta: { awaitRefetch: true, cacheOperations: ["account"] },
				mutationFn: async () => undefined,
			})
			.execute(undefined);
		expect(client.getQueryState(brl)?.isInvalidated).toBe(true);
		expect(client.getQueryState(usd)?.isInvalidated).toBe(false);
		expect(client.getQueryState(other)?.isInvalidated).toBe(false);
		identity = "user:second";
		client.clear();
	});
	it("ignores failures and completions from an old identity", async () => {
		const client = new QueryClient();
		let identity: CacheIdentity = "user:first";
		configureMutationInvalidation(client, { currency: () => "BRL", identity: () => identity });
		const key = queryKeys.accounts.list("user:second");
		client.setQueryData(key, []);
		await client
			.getMutationCache()
			.build(client, {
				meta: { cacheOperations: ["account"] },
				mutationFn: async () => {
					identity = "user:second";
				},
			})
			.execute(undefined);
		expect(client.getQueryState(key)?.isInvalidated).toBe(false);
		await expect(
			client
				.getMutationCache()
				.build(client, {
					meta: { cacheOperations: ["account"] },
					mutationFn: async () => {
						throw new Error("failed persistence");
					},
				})
				.execute(undefined),
		).rejects.toThrow("failed persistence");
		expect(client.getQueryState(key)?.isInvalidated).toBe(false);
		client.clear();
	});
});

it("isolates administrative invalidation by captured owner", async () => {
	const client = new QueryClient();
	let identity: CacheIdentity = "user:admin";
	configureMutationInvalidation(client, { currency: () => "BRL", identity: () => identity });
	const owned = ["admin-institution-catalog", "admin"];
	const other = ["admin-institution-catalog", "other"];
	const unrelated = ["admin-users", "admin"];
	for (const [key, owner] of [
		[owned, "user:admin"],
		[other, "user:other"],
		[unrelated, "user:admin"],
	] as const) {
		client.setQueryDefaults(key, { meta: { cacheIdentity: owner } });
		client.setQueryData(key, []);
	}
	await client
		.getMutationCache()
		.build(client, {
			meta: { awaitRefetch: true, cacheOperations: ["institution"] },
			mutationFn: async () => undefined,
		})
		.execute(undefined);
	expect(client.getQueryState(owned)?.isInvalidated).toBe(true);
	expect(client.getQueryState(other)?.isInvalidated).toBe(false);
	expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
	client.setQueryData(owned, []);
	await client
		.getMutationCache()
		.build(client, {
			meta: { cacheOperations: ["institution"] },
			mutationFn: async () => {
				identity = "user:other";
			},
		})
		.execute(undefined);
	expect(client.getQueryState(owned)?.isInvalidated).toBe(false);
	client.clear();
});

it("refreshes the shared public tax catalog without carrying an old mutation across identities", async () => {
	const client = new QueryClient();
	let identity: CacheIdentity = "user:current-admin";
	configureMutationInvalidation(client, { currency: () => "BRL", identity: () => identity });
	const key = ["tax-definitions"];
	client.setQueryDefaults(key, { meta: { cacheIdentity: "user:previous-admin" } });
	client.setQueryData(key, []);
	await client
		.getMutationCache()
		.build(client, {
			meta: { awaitRefetch: true, cacheOperations: ["tax"] },
			mutationFn: async () => undefined,
		})
		.execute(undefined);
	expect(client.getQueryState(key)?.isInvalidated).toBe(true);
	client.setQueryData(key, []);
	await client
		.getMutationCache()
		.build(client, {
			meta: { cacheOperations: ["tax"] },
			mutationFn: async () => {
				identity = "user:next-admin";
			},
		})
		.execute(undefined);
	expect(client.getQueryState(key)?.isInvalidated).toBe(false);
	client.clear();
});
