import { expect, test } from "bun:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { MonthlyBudget } from "../monthly-budget";

test("budget sync preserves concurrent edits, deletions and ownership", async () => {
	if (typeof indexedDB === "undefined")
		Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
	if (!globalThis.window)
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location: { origin: "http://localhost" } },
		});
	const { localMonthlyBudgets, acknowledgeMonthlyBudgetSync } = await import("../localStorage");
	const owner = "user:budget-storage" as const;
	const budget: MonthlyBudget = {
		amount: 8500,
		categoryId: null,
		currency: "BRL",
		endMonth: null,
		id: "budget",
		name: "Faturas",
		source: "STATEMENTS",
		startMonth: "2026-10",
		userId: "budget-storage",
	};
	await localMonthlyBudgets.put(budget, budget.id, owner);
	const sent = await localMonthlyBudgets.getAllWithTombstones(owner);
	expect(sent[0].syncedAt).toBeUndefined();
	await localMonthlyBudgets.put({ ...budget, amount: 9000 }, budget.id, owner);
	await acknowledgeMonthlyBudgetSync(sent, [budget], owner);
	expect((await localMonthlyBudgets.getById(budget.id, owner))?.data.amount).toBe(9000);
	expect(await localMonthlyBudgets.getAll("user:other-budget-storage")).toHaveLength(0);
	const revised = await localMonthlyBudgets.getAllWithTombstones(owner);
	await acknowledgeMonthlyBudgetSync(revised, [{ ...budget, amount: 9000 }], owner);
	const synced = (await localMonthlyBudgets.getAll(owner))[0];
	expect(synced.modifiedAt).toBe(synced.syncedAt!);
	await localMonthlyBudgets.delete(budget.id, owner);
	const deleted = await localMonthlyBudgets.getAllWithTombstones(owner);
	expect(deleted[0].deleted).toBe(true);
	await acknowledgeMonthlyBudgetSync(deleted, [], owner);
	expect(await localMonthlyBudgets.getAllWithTombstones(owner)).toHaveLength(0);
});
