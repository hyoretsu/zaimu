import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import type { FinancialAccount } from "./api";

test("guest snapshots use dated profile benefits, auto destination and preserve old rewards", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const { localAccounts } = await import("./localStorage");
	const { guestCashbackSnapshot } = await import("./cashback-snapshot");
	const owner = "guest:profile-benefits";
	const source: FinancialAccount = {
		balance: null,
		cardRulesProfiles: [
			{ id: "base", isDefault: true },
			{
				creditCardRules: {
					cashback: {
						conversionAmount: null,
						conversionPoints: null,
						kind: "CASHBACK",
						rate: 2,
						yieldPeriod: null,
						yieldReferencePercentage: null,
						yieldReferenceRate: null,
					},
					workingDueDate: true,
				},
				id: "premium",
				isDefault: false,
			},
		],
		createdAt: "2026-01-01",
		currency: "BRL",
		id: "card-account",
		institution: { creditCardRules: { cashback: null, workingDueDate: false }, id: "bank", name: "Bank" },
		institutionId: "bank",
		institutionProfileChanges: [
			{ effectiveDate: "2026-10-20", profileId: "premium" },
			{ effectiveDate: "2026-11-01", profileId: "base" },
		],
		name: null,
		type: "CREDIT_CARD",
		updatedAt: "2026-01-01",
		userId: "profile-benefits",
	};
	await localAccounts.put(source, source.id, owner);
	const card = { cashbackAccountId: "forged", cashbackRate: 99, financialAccountId: source.id };
	const rate = async () => 1;
	expect(await guestCashbackSnapshot(card, 100, "BRL", "2026-10-19", rate, owner)).toEqual({});
	const active = await guestCashbackSnapshot(card, 100, "BRL", "2026-10-20", rate, owner);
	expect(active.cashbackAmount).toBe(2);
	expect(active.cashbackAccountId).not.toBe("forged");
	const again = await guestCashbackSnapshot(card, 50, "BRL", "2026-10-21", rate, owner);
	expect(again.cashbackAccountId).toBe(active.cashbackAccountId);
	expect(await guestCashbackSnapshot(card, 100, "BRL", "2026-11-01", rate, owner)).toEqual({});
	expect(active.cashbackAmount).toBe(2);
	expect((await localAccounts.getById(active.cashbackAccountId!, owner))?.data.rewardsAccount?.kind).toBe(
		"CASHBACK",
	);
});
