import { describe, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
	cacheOperationDomains,
	closeImportReview,
	getCacheIdentity,
	invalidateCacheOperation,
	queryKeys,
} from "./query-cache";

const identity = "user:user-a" as const;

describe("query cache", () => {
	test("derives isolated authenticated and guest identities", () => {
		expect(
			getCacheIdentity({
				guestId: "guest-a",
				isAuthenticated: true,
				isGuestMode: false,
				user: {
					createdAt: new Date(),
					email: "user@example.com",
					emailVerified: true,
					id: "user-a",
					name: "User",
					updatedAt: new Date(),
				},
			}),
		).toBe("user:user-a");
		expect(
			getCacheIdentity({ guestId: "guest-a", isAuthenticated: false, isGuestMode: true, user: null }),
		).toBe("guest:guest-a");
		expect(
			getCacheIdentity({ guestId: "guest-a", isAuthenticated: false, isGuestMode: false, user: null }),
		).toBeNull();
	});

	test("keeps list variants under one typed domain root", () => {
		expect([...queryKeys.transactions.list(identity, { type: "EXPENSE" }).slice(0, 3)]).toEqual([
			...queryKeys.transactions.all(identity),
		]);
		expect(queryKeys.accounts.list(identity)).not.toEqual(queryKeys.accounts.list("user:user-b"));
	});

	test("invalidates active and inactive derived queries without removing data", async () => {
		const queryClient = new QueryClient();
		const transactionKey = queryKeys.transactions.list(identity, { type: "EXPENSE" });
		const suggestionsKey = [...queryKeys.creditCards.list(identity), "payment-suggestions"];
		const otherSuggestionsKey = [...queryKeys.creditCards.list("user:user-b"), "payment-suggestions"];
		const dashboardKey = queryKeys.dashboard.detail(identity, { from: "2026-01-01" });
		let fetchCount = 0;
		const observer = new QueryObserver(queryClient, {
			queryFn: async () => {
				fetchCount++;
				return ["transaction"];
			},
			queryKey: transactionKey,
		});
		const unsubscribe = observer.subscribe(() => undefined);
		await queryClient.ensureQueryData({ queryFn: () => ["transaction"], queryKey: transactionKey });
		queryClient.setQueryData(dashboardKey, { balance: 100 });
		queryClient.setQueryData(suggestionsKey, []);
		queryClient.setQueryData(otherSuggestionsKey, []);

		await invalidateCacheOperation(queryClient, identity, "transaction");

		expect(fetchCount).toBeGreaterThanOrEqual(2);
		expect(queryClient.getQueryState(suggestionsKey)?.isInvalidated).toBeTrue();
		expect(queryClient.getQueryState(otherSuggestionsKey)?.isInvalidated).toBeFalse();
		expect(queryClient.getQueryState(dashboardKey)?.isInvalidated).toBeTrue();
		expect(queryClient.getQueryData<string[]>(transactionKey)).toEqual(["transaction"]);
		unsubscribe();
	});

	test("confirmation does not await derived reads; dependent flows may opt in", async () => {
		for (const awaitRefetch of [false, true]) {
			const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
			const key = queryKeys.creditCards.list(identity);
			client.setQueryData(key, ["before"]);
			let resolve!: (value: string[]) => void;
			const read = new Promise<string[]>(done => {
				resolve = done;
			});
			const observer = new QueryObserver(client, {
				queryFn: () => read,
				queryKey: key,
				staleTime: Number.POSITIVE_INFINITY,
			});
			const unsubscribe = observer.subscribe(() => undefined);
			let confirmed = false;
			const pending = invalidateCacheOperation(client, identity, "statement", { awaitRefetch }).then(() => {
				confirmed = true;
			});
			if (!awaitRefetch) await pending;
			else await Promise.resolve();
			expect(confirmed).toBe(!awaitRefetch);
			expect(client.getQueryState(key)?.isInvalidated).toBeTrue();
			expect(client.getQueryState(key)?.fetchStatus).toBe("fetching");
			expect(client.getQueryData<string[]>(key)).toEqual(["before"]);
			resolve(["after"]);
			await pending;
			await client.refetchQueries({ queryKey: key }, { cancelRefetch: false });
			expect(client.getQueryData<string[]>(key)).toEqual(["after"]);
			unsubscribe();
			client.clear();
		}
	});

	test("maps every mutation family to its direct and derived domains", () => {
		expect(cacheOperationDomains.transaction).toContain("accountYields");
		expect(cacheOperationDomains.statement).toContain("creditCards");
		expect(cacheOperationDomains.recurring).toContain("dashboard");
		expect(cacheOperationDomains.holiday).toContain("transactions");
		expect(cacheOperationDomains.debt).toContain("dashboard");
		expect(cacheOperationDomains.loan).toContain("accounts");
	});

	test("removes a closed import detail and invalidates only its pending list", async () => {
		const queryClient = new QueryClient();
		const detailKey = queryKeys.transactionImports.detail(identity, "import-a");
		const pendingKey = queryKeys.transactionImports.pending(identity);
		queryClient.setQueryData(detailKey, { id: "import-a" });
		queryClient.setQueryData(pendingKey, [{ id: "import-a" }]);

		await closeImportReview(queryClient, identity, "transaction", "import-a");

		expect(queryClient.getQueryData(detailKey)).toBeUndefined();
		expect(queryClient.getQueryState(pendingKey)?.isInvalidated).toBeTrue();
	});
});
