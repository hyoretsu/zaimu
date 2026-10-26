import { expect, it } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { refreshQueries } from "./refresh-queries";

it("shares concurrent refreshes and reads the latest write after the in-flight response", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const key = ["refresh"];
	client.setQueryData(key, 0);
	let calls = 0;
	let aborts = 0;
	const completions: Array<(value: number) => void> = [];
	const observer = new QueryObserver(client, {
		queryFn: ({ signal }) => {
			calls++;
			signal.addEventListener("abort", () => aborts++);
			return new Promise<number>(resolve => completions.push(resolve));
		},
		queryKey: key,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const unsubscribe = observer.subscribe(() => undefined);
	const first = refreshQueries(client, { queryKey: key });
	await Promise.resolve();
	await Promise.resolve();
	expect(calls).toBe(1);
	const others = Array.from({ length: 5 }, () => refreshQueries(client, { queryKey: key }));
	await Promise.resolve();
	await Promise.resolve();
	expect(calls).toBe(1);
	expect(aborts).toBe(0);
	completions.shift()!(1);
	for (let i = 0; i < 20 && calls < 2; i++) await Promise.resolve();
	expect(calls).toBe(2);
	completions.shift()!(2);
	await Promise.all([first, ...others]);
	expect(client.getQueryData<number>(key)).toBe(2);
	expect(aborts).toBe(0);
	unsubscribe();
	client.clear();
});

it("reports real refresh failures and permits a later retry", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const key = ["retry-refresh"];
	client.setQueryData(key, 0);
	let fail = true;
	const observer = new QueryObserver(client, {
		queryFn: async () => {
			if (fail) throw new Error("offline");
			return 1;
		},
		queryKey: key,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const unsubscribe = observer.subscribe(() => undefined);
	await expect(refreshQueries(client, { queryKey: key })).rejects.toThrow("offline");
	fail = false;
	await refreshQueries(client, { queryKey: key });
	expect(client.getQueryData<number>(key)).toBe(1);
	unsubscribe();
	client.clear();
});
