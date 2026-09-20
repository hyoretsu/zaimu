import { describe, expect, test } from "bun:test";
import { calculateFinancialAccountYieldBalances } from "./calculate-financial-account-yields";

describe("calculateFinancialAccountYieldBalances", () => {
	const account = {
		createdAt: new Date("2026-01-05T12:00:00"),
		id: "account",
		type: "CHECKING",
		yieldFixedRate: 10,
		yieldPeriod: "MONTHLY" as const,
	};

	test("compounds only on weekdays", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [account],
			cashbackCredits: [],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-06T12:00:00"),
			transactions: [
				{ amount: 100, date: new Date("2026-01-05T12:00:00"), destinationFinancialAccountId: "account" },
			],
		});
		const dailyRate = 1.1 ** (1 / 21) - 1;
		expect(balances.get("account")).toBeCloseTo(100 * (1 + dailyRate) ** 2, 4);
	});

	test("keeps database date-only timestamps on their UTC calendar date", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [{ ...account, yieldFixedRate: null, yieldPeriod: null }],
			cashbackCredits: [],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-05T12:00:00"),
			transactions: [
				{ amount: 100, date: new Date("2026-01-06T00:00:00Z"), destinationFinancialAccountId: "account" },
			],
		});

		expect(balances.get("account")).toBe(0);
	});

	test("skips all account yields on a holiday", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [account],
			cashbackCredits: [],
			holidays: [new Date("2026-01-06T12:00:00")],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-06T12:00:00"),
			transactions: [
				{ amount: 100, date: new Date("2026-01-05T12:00:00"), destinationFinancialAccountId: "account" },
			],
		});
		const dailyRate = 1.1 ** (1 / 21) - 1;
		expect(balances.get("account")).toBeCloseTo(100 * (1 + dailyRate), 4);
	});

	test("adds the referenced and fixed portions before daily compounding", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [
				{
					...account,
					yieldFixedRate: 0.5,
					yieldPeriod: "YEARLY",
					yieldReferencePercentage: 105,
					yieldReferenceRate: 10,
				},
			],
			cashbackCredits: [],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-05T12:00:00"),
			transactions: [
				{ amount: 100, date: new Date("2026-01-05T12:00:00"), destinationFinancialAccountId: "account" },
			],
		});
		const effectiveRate = 10 * 1.05 + 0.5;
		expect(balances.get("account")).toBeCloseTo(100 * (1 + effectiveRate / 100) ** (1 / 252), 4);
	});

	test("reduces automatic yields by the configured tax rate", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [{ ...account, yieldTaxRate: 15 }],
			cashbackCredits: [],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-05T12:00:00"),
			transactions: [
				{ amount: 100, date: new Date("2026-01-05T12:00:00"), destinationFinancialAccountId: "account" },
			],
		});
		const dailyRate = 1.1 ** (1 / 21) - 1;
		expect(balances.get("account")).toBeCloseTo(100 * (1 + dailyRate * 0.85), 4);
	});

	test("applies the reference percentage to cashback snapshots", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [{ ...account, id: "rewards", type: "REWARDS", yieldFixedRate: null, yieldPeriod: null }],
			cashbackCredits: [
				{
					cashbackAccountId: "rewards",
					cashbackAmount: 100,
					cashbackYieldPeriod: "MONTHLY",
					cashbackYieldReferencePercentage: 50,
					cashbackYieldReferenceRate: 10,
					purchaseDate: new Date("2026-01-05T12:00:00"),
				},
			],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-05T12:00:00"),
			transactions: [],
		});
		const dailyRate = 1.05 ** (1 / 21) - 1;
		expect(balances.get("rewards")).toBeCloseTo(100 * (1 + dailyRate), 4);
	});

	test("preserves the former rate before a scheduled change", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [
				{
					...account,
					yieldFixedRate: 20,
					yieldRateHistories: [
						{ effectiveDate: new Date("2026-01-05T12:00:00"), yieldFixedRate: 10, yieldPeriod: "MONTHLY" },
						{ effectiveDate: new Date("2026-01-06T12:00:00"), yieldFixedRate: 20, yieldPeriod: "MONTHLY" },
					],
				},
			],
			cashbackCredits: [],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-06T12:00:00"),
			transactions: [
				{ amount: 100, date: new Date("2026-01-05T12:00:00"), destinationFinancialAccountId: "account" },
			],
		});
		expect(balances.get("account")).toBeCloseTo(100 * 1.1 ** (1 / 21) * 1.2 ** (1 / 21), 4);
	});

	test("uses edits and manual yields in the account balance", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [account],
			cashbackCredits: [],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-06T12:00:00"),
			transactions: [
				{ amount: 100, date: new Date("2026-01-05T12:00:00"), destinationFinancialAccountId: "account" },
			],
			yields: [
				{
					amount: 1,
					date: new Date("2026-01-05T12:00:00"),
					financialAccountId: "account",
					isExcluded: false,
					kind: "AUTOMATIC",
				},
				{
					amount: 2,
					date: new Date("2026-01-06T12:00:00"),
					financialAccountId: "account",
					isExcluded: false,
					kind: "MANUAL",
				},
			],
		});
		const dailyRate = 1.1 ** (1 / 21) - 1;
		expect(balances.get("account")).toBeCloseTo(101 * (1 + dailyRate) + 2, 4);
	});

	test("uses progressive institution brackets when the account has no specific rule", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [
				{
					...account,
					institutionYieldPolicies: [
						{
							effectiveDate: new Date("2026-01-05T12:00:00"),
							rules: [
								{ upToBalance: 10_000, yieldFixedRate: 10 },
								{ upToBalance: null, yieldFixedRate: 20 },
							],
							yieldPeriod: "YEARLY",
						},
					],
					yieldFixedRate: null,
					yieldPeriod: null,
				},
			],
			cashbackCredits: [],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-05T12:00:00"),
			transactions: [
				{
					amount: 15_000,
					date: new Date("2026-01-05T12:00:00"),
					destinationFinancialAccountId: "account",
				},
			],
		});
		const expected = 15_000 + 10_000 * (1.1 ** (1 / 252) - 1) + 5_000 * (1.2 ** (1 / 252) - 1);
		expect(balances.get("account")).toBeCloseTo(expected, 4);
	});

	test("prefers the account rule over the institution policy", () => {
		const balances = calculateFinancialAccountYieldBalances({
			accounts: [
				{
					...account,
					institutionYieldPolicies: [
						{
							effectiveDate: new Date("2026-01-05T12:00:00"),
							rules: [{ upToBalance: null, yieldFixedRate: 50 }],
							yieldPeriod: "MONTHLY",
						},
					],
				},
			],
			cashbackCredits: [],
			holidays: [],
			initialRewardsBalances: new Map(),
			today: new Date("2026-01-05T12:00:00"),
			transactions: [
				{
					amount: 100,
					date: new Date("2026-01-05T12:00:00"),
					destinationFinancialAccountId: "account",
				},
			],
		});
		expect(balances.get("account")).toBeCloseTo(100 * 1.1 ** (1 / 21), 4);
	});
});
