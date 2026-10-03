import { expect, test } from "bun:test";
import { projectedNetYield, type YieldAccount } from "./projected-yield";

const account: YieldAccount = {
	createdAt: "2020-01-01",
	id: "a",
	type: "SAVINGS",
	yieldReferencePercentage: 100,
	yieldReferenceType: "CDI",
	yieldTaxRate: 20,
};
test("projection applies official mean daily rate and tax", () => {
	expect(projectedNetYield(account, 1000, "2026-10-05", { CDI: 0.05 })).toBeCloseTo(0.4);
});
test("projection skips weekends, holidays and exhausted balances", () => {
	expect(projectedNetYield(account, 1000, "2026-10-03", { CDI: 0.05 })).toBe(0);
	expect(projectedNetYield(account, 1000, "2026-10-05", { CDI: 0.05 }, new Set(["2026-10-05"]))).toBe(0);
	expect(projectedNetYield(account, -100, "2026-10-05", { CDI: 0.05 })).toBe(0);
});
test("unavailable reference still permits configured fixed component", () => {
	const fixed = { ...account, yieldFixedRate: 12, yieldPeriod: "YEARLY" as const };
	expect(projectedNetYield(fixed, 1000, "2026-10-05", {})).toBeGreaterThan(0);
});
test("projection respects dated institution tiers", () => {
	const tiered: YieldAccount = {
		...account,
		institutionYieldPolicies: [
			{
				effectiveDate: "2026-01-01",
				rules: [
					{ upToBalance: 500, yieldReferencePercentage: 100, yieldReferenceType: "CDI" },
					{ yieldReferencePercentage: 50, yieldReferenceType: "CDI" },
				],
				yieldTaxRate: 0,
			},
		],
		yieldReferenceType: null,
	};
	expect(projectedNetYield(tiered, 1000, "2026-10-05", { CDI: 0.05 })).toBeCloseTo(0.375);
});
