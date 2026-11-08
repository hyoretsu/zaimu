import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("cashback checkpoints support create, update and delete while points are rejected", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("../localStorage");
	const { useAuthStore } = await import("@/stores/auth");
	const owner = "guest:cashback_checkpoint_test" as const;
	useAuthStore.setState({
		guestId: "cashback_checkpoint_test",
		isAuthenticated: false,
		isGuestMode: true,
		isInitialized: true,
	});
	// Monetary rewards accept checkpoints; points remain outside monetary adjustments.
	for (const kind of ["CASHBACK", "POINTS"] as const) {
		const id = `checkpoint-${kind}`;
		await storage.localAccounts.put(
			{
				assets: [{ assetCode: "BRL", balance: "10" }],
				createdAt: "2026-01-01",
				id,
				name: kind,
				rewardsAccount: { initialBalance: 10, kind },
				type: "REWARDS",
				userId: "guest",
				yieldCurrency: "BRL",
			} as never,
			id,
			owner,
		);
		const input = { assetCode: "BRL", balance: "50", date: "2026-01-02", financialAccountId: id };
		if (kind === "POINTS") {
			await expect(storage.mutateLocalBalanceAdjustment(input)).rejects.toThrow(
				"Selecione uma conta válida",
			);
			continue;
		}
		await storage.mutateLocalBalanceAdjustment(input);
		const adjustment = (await storage.localAccounts.getById(id, owner))!.data.balanceAdjustments![0];
		expect(adjustment.balance).toBe("50.00");
		await storage.mutateLocalBalanceAdjustment({ ...input, balance: "75", id: adjustment.id });
		expect((await storage.localAccounts.getById(id, owner))!.data.balanceAdjustments![0].balance).toBe(
			"75.00",
		);
		await storage.mutateLocalBalanceAdjustment({ id: adjustment.id }, true);
		expect((await storage.localAccounts.getById(id, owner))!.data.balanceAdjustments).toHaveLength(0);
	}
});
