import { expect, test } from "bun:test";
import { getYieldSettings } from "@zaimu/finance/projected-yield";
import { prepareGuestYieldRecalculation, preserveAdjustedAccountYields } from "./account-yield-recalculation";
import type { FinancialAccount, FinancialAccountYield } from "./api";
import { calculateFinancialAccountYieldEntries } from "./financial-account";

const account: FinancialAccount = {
	balance: 100,
	countryCode: "BR",
	createdAt: "2025-01-01",
	currency: "BRL",
	id: "account",
	institution: {
		id: "bank",
		name: "Banco",
		yieldPolicies: [
			{
				effectiveDate: "2026-01-01",
				profileId: "other",
				rules: [{ yieldFixedRate: 20 }],
				yieldPeriod: "YEARLY",
			},
			{
				effectiveDate: "2027-01-01",
				profileId: "other",
				rules: [{ yieldFixedRate: 30 }],
				yieldPeriod: "YEARLY",
			},
		],
	},
	name: "Conta",
	type: "CHECKING",
	updatedAt: "2025-01-01",
	userId: "guest",
	yieldRateHistories: [
		{ effectiveDate: "2025-01-01", yieldFixedRate: 5, yieldPeriod: "YEARLY" },
		{ effectiveDate: "2026-01-01", yieldFixedRate: 10, yieldPeriod: "YEARLY" },
	],
};

test("visitor current rule uses latest effective account rule", () => {
	expect(prepareGuestYieldRecalculation(account, undefined, "2026-10-12").settings).toMatchObject({
		yieldFixedRate: 10,
	});
});
test("visitor alternate profile overrides personal rule and ignores future versions", () => {
	expect(prepareGuestYieldRecalculation(account, "other", "2026-10-12").settings).toMatchObject({
		rules: [{ yieldFixedRate: 20 }],
	});
});
test("visitor rejects unavailable profiles and official rate dependent rules before mutation", () => {
	expect(() => prepareGuestYieldRecalculation(account, "missing", "2026-10-12")).toThrow();
	expect(() =>
		prepareGuestYieldRecalculation(
			{
				...account,
				yieldRateHistories: [
					{
						effectiveDate: "2025-01-01",
						yieldPeriod: "YEARLY",
						yieldReferencePercentage: 100,
						yieldReferenceType: "CDI",
					},
				],
			},
			undefined,
			"2026-10-12",
		),
	).toThrow("histórico oficial");
});

test("custom visitor snapshot recalculates fixed history and preserves future account configuration", () => {
	const prepared = prepareGuestYieldRecalculation(account, undefined, "2026-10-12", {
		yieldFixedRate: 20,
		yieldPeriod: "YEARLY",
	});
	const updated = {
		...account,
		historicalYieldSettings: { settings: prepared.settings, throughDate: prepared.today },
	};
	const movements = [
		{
			amount: 1000,
			date: "2026-10-09",
			destinationAmount: null,
			destinationFinancialAccountId: account.id,
			id: "deposit",
			originFinancialAccountId: null,
		},
	];
	const before = calculateFinancialAccountYieldEntries(
		account,
		movements,
		[],
		new Date("2026-10-12T12:00:00"),
	);
	const after = calculateFinancialAccountYieldEntries(
		updated,
		movements,
		[],
		new Date("2026-10-12T12:00:00"),
	);
	expect(after[0]!.amount).toBeGreaterThan(before[0]!.amount);
	expect(getYieldSettings(updated, "2026-10-13")).toMatchObject({ yieldFixedRate: 10 });
	expect(updated.yieldRateHistories).toEqual(account.yieldRateHistories);
});

test("recalculation preserves manual entries, user automatic adjustments, exclusions, and other accounts", () => {
	const entry: FinancialAccountYield = {
		amount: 1,
		date: "2026-10-09",
		financialAccountId: account.id,
		id: "system",
		isExcluded: false,
		kind: "AUTOMATIC",
		origin: "SYSTEM",
	};
	const entries = [
		entry,
		{ ...entry, id: "manual", kind: "MANUAL" as const },
		{ ...entry, id: "adjusted", origin: "USER" as const },
		{ ...entry, id: "excluded", isExcluded: true },
		{ ...entry, financialAccountId: "another", id: "other" },
	];
	expect(preserveAdjustedAccountYields(entries, account.id).map(row => row.id)).toEqual([
		"manual",
		"adjusted",
		"excluded",
		"other",
	]);
});
