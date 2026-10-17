import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

if (!globalThis.window)
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
const { cacheDomainTags, configureQueryTags } = await import("./query-tags");
const { queryKeys } = await import("./query-cache");

test("associates generated tags without changing identity, filters or pagination", () => {
	const client = new QueryClient();
	const unsubscribe = configureQueryTags(client);
	const key = [
		...queryKeys.transactions.all("user:tags"),
		"list",
		{ categoryId: "category", cursor: "page-2" },
	];
	client.setQueryData(key, ["existing"]);
	const query = client.getQueryCache().find({ exact: true, queryKey: key });
	expect(query?.queryKey).toEqual(key);
	expect(query?.meta).toMatchObject({ apiTags: cacheDomainTags.transactions, cacheIdentity: "user:tags" });
	expect(query?.state.data).toEqual(["existing"]);
	unsubscribe();
	client.clear();
});

test("leaves public query metadata intact", () => {
	const client = new QueryClient();
	const unsubscribe = configureQueryTags(client);
	const key = ["reference-rates", "averages"];
	client.setQueryData(key, {});
	expect(client.getQueryCache().find({ queryKey: key })?.meta).toBeUndefined();
	unsubscribe();
	client.clear();
});

test("tags Open Finance without changing owner or configuration key", () => {
	const client = new QueryClient();
	const unsubscribe = configureQueryTags(client);
	const key = ["identity", "user:open-finance", "open-finance", "configuration"];
	client.setQueryData(key, { configured: true });
	const query = client.getQueryCache().find({ exact: true, queryKey: key });
	expect(query?.meta?.cacheIdentity).toBe("user:open-finance");
	expect(query?.meta?.apiTags?.length).toBe(1);
	expect(query?.queryKey).toEqual(key);
	unsubscribe();
	client.clear();
});

test("retains generated tags after an observer reapplies query options", async () => {
	const { QueryObserver } = await import("@tanstack/react-query");
	const client = new QueryClient();
	const unsubscribeTags = configureQueryTags(client);
	const key = queryKeys.accounts.list("user:observer");
	const observer = new QueryObserver(client, { queryFn: async () => [], queryKey: key });
	const unsubscribe = observer.subscribe(() => undefined);
	await observer.refetch();
	observer.setOptions({ queryFn: async () => [], queryKey: key, staleTime: 5000 });
	expect(client.getQueryCache().find({ queryKey: key })?.meta?.apiTags).toEqual(cacheDomainTags.accounts);
	unsubscribe();
	unsubscribeTags();
	client.clear();
});
