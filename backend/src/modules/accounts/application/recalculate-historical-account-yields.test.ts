import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import type { YieldAccount } from "../domain/calculate-financial-account-yields";
import { HistoricalYieldSettingsDTO } from "../domain/historical-yield-settings-schema";
import { selectHistoricalYieldSettings } from "./recalculate-historical-account-yields";

const account: YieldAccount = {
	countryCode: "BR",
	createdAt: new Date("2025-01-01"),
	currency: "BRL",
	id: "account",
	institutionYieldPolicies: [
		{
			countryCode: "BR",
			currency: "BRL",
			effectiveDate: new Date("2026-01-01"),
			profileId: "plus",
			rules: [
				{ upToBalance: 10000, yieldReferencePercentage: 120, yieldReferenceType: "CDI" },
				{ yieldReferencePercentage: 100, yieldReferenceType: "CDI" },
			],
			status: "APPROVED",
		},
	],
	type: "CHECKING",
	yieldFixedRate: 8,
	yieldPeriod: "YEARLY",
};

describe("historical account yield rule selection", () => {
	test("uses current effective account history instead of base rate", () => {
		const settings = selectHistoricalYieldSettings(
			{
				...account,
				yieldRateHistories: [
					{ effectiveDate: new Date("2026-02-01"), yieldFixedRate: 10, yieldPeriod: "YEARLY" },
				],
			},
			"2026-10-12",
		);
		expect(settings).toMatchObject({ yieldFixedRate: 10 });
	});
	test("selects another profile without changing original account fields or losing tiers", () => {
		const settings = selectHistoricalYieldSettings(account, "2026-10-12", "plus");
		expect(settings).toMatchObject({ rules: account.institutionYieldPolicies![0]!.rules });
		expect(account.yieldFixedRate).toBe(8);
	});
	test("rejects profiles without an applicable approved currency and country rule", () => {
		expect(() => selectHistoricalYieldSettings(account, "2025-10-12", "plus")).toThrow();
		expect(() =>
			selectHistoricalYieldSettings({ ...account, currency: "USD" }, "2026-10-12", "plus"),
		).toThrow();
		expect(() =>
			selectHistoricalYieldSettings({ ...account, countryCode: "US" }, "2026-10-12", "plus"),
		).toThrow();
		expect(() => selectHistoricalYieldSettings(account, "2026-10-12", "other")).toThrow();
	});
	test("rejects credit cards", () => {
		expect(() => selectHistoricalYieldSettings({ ...account, type: "CREDIT_CARD" }, "2026-10-12")).toThrow();
	});
	test("custom rate applies to an account without institutional rules", () => {
		const settings = selectHistoricalYieldSettings(
			{ ...account, institutionYieldPolicies: [] },
			"2026-10-12",
			null,
			{ yieldFixedRate: 14, yieldPeriod: "YEARLY" },
		);
		expect(settings).toMatchObject({ yieldFixedRate: 14, yieldPeriod: "YEARLY" });
	});
});

test("sync validates tiered snapshots instead of accepting malformed rules as a flat rate", () => {
	const snapshot = { settings: { effectiveDate: "2026-10-12", rules: "invalid" }, throughDate: "2026-10-12" };
	expect(Value.Check(HistoricalYieldSettingsDTO, snapshot)).toBe(false);
	expect(
		Value.Check(HistoricalYieldSettingsDTO, {
			...snapshot,
			settings: { ...snapshot.settings, rules: [{ yieldFixedRate: 10 }], yieldPeriod: "YEARLY" },
		}),
	).toBe(true);
});

test("historical collection stops yesterday and skips accounts created today", async () => {
	const { historicalYieldCollectionWindow } = await import("./recalculate-historical-account-yields");
	const now = new Date(2026, 9, 15, 12);
	expect(historicalYieldCollectionWindow(new Date(2000, 0, 1), now)).toEqual({
		endDate: "2026-10-14",
		startDate: "2000-01-01",
	});
	expect(historicalYieldCollectionWindow(new Date(2026, 9, 14), now)).toEqual({
		endDate: "2026-10-14",
		startDate: "2026-10-14",
	});
	expect(historicalYieldCollectionWindow(new Date(2026, 9, 15), now)).toBeNull();
});
