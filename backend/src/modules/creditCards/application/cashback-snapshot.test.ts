import { expect, test } from "bun:test";
import { cardRuleValues, defaultCardRules } from "@zaimu/finance/institution-card-rules";
import { createRewardSnapshotLoader } from "./cashback-snapshot";

test("approval reuses policies while rounding each reward and isolating date, currency, card and owner", async () => {
	let loads = 0;
	const context: NonNullable<Parameters<typeof createRewardSnapshotLoader>[0]> = async (
		card,
		source,
		date,
		userId,
	) => {
		loads++;
		return {
			card: {
				...cardRuleValues(defaultCardRules),
				cashbackAccountId: `${userId}-${card.id}`,
				cashbackRate: 1,
			},
			currency: source,
			date,
			source,
		};
	};
	const reward = createRewardSnapshotLoader(context);
	const base = [{ id: "card" }, "BRL", "2024-01-01", "owner"] as const;
	expect((await reward(base[0], 10.99, base[1], base[2], base[3])).cashbackAmount).toBe("0.11");
	expect((await reward(base[0], 20.05, base[1], base[2], base[3])).cashbackAmount).toBe("0.20");
	expect(loads).toBe(1);
	expect((await reward({ id: "card" }, 100, "BRL", "2024-01-02", "owner")).cashbackAmount).toBe("1.00");
	expect((await reward({ id: "card" }, 100, "USD", "2024-01-01", "owner")).cashbackCurrency).toBe("USD");
	expect((await reward({ id: "other" }, 100, "BRL", "2024-01-01", "owner")).cashbackAccountId).toBe(
		"owner-other",
	);
	expect((await reward({ id: "card" }, 100, "BRL", "2024-01-01", "other")).cashbackAccountId).toBe(
		"other-card",
	);
	expect(loads).toBe(5);
	await createRewardSnapshotLoader(context)({ id: "card" }, 100, "BRL", "2024-01-01", "owner");
	expect(loads).toBe(6);
});
