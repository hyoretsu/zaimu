import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { closeImportReview, getCacheIdentity, invalidateCacheOperation, queryKeys } from "./query-cache";

const identity = "user:user-a" as const;

describe("query cache", () => {
	test("derives isolated authenticated and guest identities", () => {
		expect(
			getCacheIdentity({
				guestId: "guest-a",
				isAuthenticated: true,
				isGuestMode: false,
				user: { id: "user-a" },
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
		expect(queryKeys.transactions.list(identity, { type: "EXPENSE" }).slice(0, 3)).toEqual(
			queryKeys.transactions.all(identity),
		);
		expect(queryKeys.accounts.list(identity)).not.toEqual(queryKeys.accounts.list("user:user-b"));
	});

	test("invalidates active and inactive derived queries without removing data", async () => {
		const queryClient = new QueryClient();
		const transactionKey = queryKeys.transactions.list(identity, { type: "EXPENSE" });
		const dashboardKey = queryKeys.dashboard.detail(identity, { from: "2026-01-01" });
		queryClient.setQueryData(transactionKey, ["transaction"]);
		queryClient.setQueryData(dashboardKey, { balance: 100 });

		await invalidateCacheOperation(queryClient, identity, "transaction");

		expect(queryClient.getQueryState(transactionKey)?.isInvalidated).toBeTrue();
		expect(queryClient.getQueryState(dashboardKey)?.isInvalidated).toBeTrue();
		expect(queryClient.getQueryData(transactionKey)).toEqual(["transaction"]);
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
