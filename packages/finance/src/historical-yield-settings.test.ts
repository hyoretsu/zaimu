import { describe, expect, test } from "bun:test";
import {
	getYieldSettings,
	historicalYieldOverride,
	trimHistoricalYieldSettings,
	type YieldAccount,
} from "./projected-yield";

const account: YieldAccount = {
	createdAt: "2025-01-01",
	id: "account",
	type: "INVESTMENT",
	yieldFixedRate: 10,
	yieldPeriod: "YEARLY",
};

describe("historical yield settings", () => {
	test("extends current rule into historical days and preserves future history", () => {
		const original = {
			...account,
			yieldRateHistories: [
				{ effectiveDate: "2026-01-01", yieldFixedRate: 12, yieldPeriod: "YEARLY" as const },
				{ effectiveDate: "2026-11-01", yieldFixedRate: 15, yieldPeriod: "YEARLY" as const },
			],
		};
		const updated = {
			...original,
			historicalYieldSettings: historicalYieldOverride(original, null, "2026-10-12"),
		};
		expect(getYieldSettings(updated, "2025-01-01")).toMatchObject({ yieldFixedRate: 12 });
		expect(getYieldSettings(updated, "2026-10-12")).toMatchObject({ yieldFixedRate: 12 });
		expect(getYieldSettings(updated, "2026-10-13")).toMatchObject({ yieldFixedRate: 12 });
		expect(getYieldSettings(updated, "2026-11-01")).toMatchObject({ yieldFixedRate: 15 });
	});
	test("repeated recalculation selects present rule instead of previous snapshot", () => {
		const updated = {
			...account,
			historicalYieldSettings: {
				settings: { effectiveDate: "2025-01-01", yieldFixedRate: 8, yieldPeriod: "YEARLY" as const },
				throughDate: "2026-10-12",
			},
		};
		expect(historicalYieldOverride(updated, null, "2026-10-12").settings).toMatchObject({
			yieldFixedRate: 10,
		});
	});
	test("snapshot stays independent of editable tiered policy", () => {
		const policy = {
			effectiveDate: "2026-01-01",
			profileId: "plus",
			rules: [{ yieldReferencePercentage: 120, yieldReferenceType: "CDI" as const }],
		};
		const original = { ...account, institutionYieldPolicies: [policy], type: "CHECKING" };
		const snapshot = historicalYieldOverride(original, "plus", "2026-10-12");
		policy.rules[0]!.yieldReferencePercentage = 100;
		expect(snapshot.settings).toMatchObject({ rules: [{ yieldReferencePercentage: 120 }] });
	});
});

test("rejects invalid custom rates before historical mutation", () => {
	expect(() =>
		historicalYieldOverride(account, null, "2026-10-12", { yieldFixedRate: -1, yieldPeriod: "YEARLY" }),
	).toThrow();
	expect(() =>
		historicalYieldOverride(account, null, "2026-10-12", {
			yieldFixedRate: 10,
			yieldPeriod: "YEARLY",
			yieldTaxRate: 101,
		}),
	).toThrow();
	expect(() =>
		historicalYieldOverride(account, null, "2026-10-12", { yieldReferenceType: "CDI" }),
	).toThrow();
});

test("explicit institutional profile applies to investment history without changing future rules", () => {
	const original = {
		...account,
		institutionYieldPolicies: [
			{
				effectiveDate: "2026-01-01",
				profileId: "plus",
				rules: [{ yieldFixedRate: 20 }],
				yieldPeriod: "YEARLY" as const,
			},
		],
	};
	const updated = {
		...original,
		historicalYieldSettings: historicalYieldOverride(original, "plus", "2026-10-12"),
	};
	expect(getYieldSettings(updated, "2025-01-01")).toMatchObject({ rules: [{ yieldFixedRate: 20 }] });
	expect(getYieldSettings(updated, "2026-10-13")).toMatchObject({ yieldFixedRate: 10 });
	expect(original.type).toBe("INVESTMENT");
});

test("later edits retain prior days and release their effective day", () => {
	const snapshot = historicalYieldOverride(account, null, "2026-10-12");
	expect(trimHistoricalYieldSettings(snapshot, "2026-10-13")).toBe(snapshot);
	const trimmed = trimHistoricalYieldSettings(snapshot, "2026-10-12");
	const updated = {
		...account,
		historicalYieldSettings: trimmed,
		yieldRateHistories: [
			{ effectiveDate: "2026-10-12", yieldFixedRate: 15, yieldPeriod: "YEARLY" as const },
		],
	};
	expect(getYieldSettings(updated, "2026-10-11")).toMatchObject({ yieldFixedRate: 10 });
	expect(getYieldSettings(updated, "2026-10-12")).toMatchObject({ yieldFixedRate: 15 });
	expect(snapshot.throughDate).toBe("2026-10-12");
});
