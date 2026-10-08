import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("guest rewards convert on purchase date to native ISO precision and preserve owner", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const { localAccounts } = await import("./localStorage");
	const { guestCashbackSnapshot } = await import("./cashback-snapshot");
	const owner = "guest:cashback-currency";
	await localAccounts.put(
		{
			balance: 0,
			createdAt: "2026-01-01",
			currency: "JPY",
			id: "reward",
			name: "Reward",
			type: "CASH",
			updatedAt: "2026-01-01",
			userId: "guest",
		},
		"reward",
		owner,
	);
	const calls: string[][] = [];
	const result = await guestCashbackSnapshot(
		{ cashbackAccountId: "reward", cashbackRate: 1 },
		100,
		"USD",
		"2026-01-02",
		async (date, from, to) => {
			calls.push([date, from, to]);
			return 149.95;
		},
		owner,
	);
	expect(result).toMatchObject({ cashbackAmount: 150, cashbackCurrency: "JPY" });
	expect(calls).toEqual([["2026-01-02", "USD", "JPY"]]);
	await expect(
		guestCashbackSnapshot(
			{ cashbackAccountId: "reward", cashbackRate: 1 },
			100,
			"USD",
			"2026-01-02",
			async () => 150,
			"guest:other",
		),
	).rejects.toThrow("Conta de recompensa");
});
