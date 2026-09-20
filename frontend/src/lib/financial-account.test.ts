import { describe, expect, test } from "bun:test";
import type { FinancialAccount } from "./api";
import {
	calculateFinancialAccountBalances,
	calculateFinancialAccountYieldEntries,
	compareFinancialAccountsByDisplayName,
	compareFinancialAccountsByOptionLabel,
	compareFinancialAccountsByTitle,
	getEffectiveYieldRate,
	getFinancialAccountDisplayName,
	getFinancialAccountOptionLabel,
	getFinancialAccountSummaryName,
	getFinancialAccountTitle,
	getTransactionAccountTypeLabel,
	getTransactionSourceAccounts,
} from "./financial-account";

describe("getEffectiveYieldRate", () => {
	test("adds referenced and fixed portions", () => {
		expect(
			getEffectiveYieldRate({
				yieldFixedRate: 0.5,
				yieldReferencePercentage: 105,
				yieldReferenceRate: 10,
			}),
		).toBe(11);
	});
});

describe("getFinancialAccountDisplayName", () => {
	test("uses the account title when present", () => {
		expect(
			getFinancialAccountDisplayName({
				institution: { id: "institution-id", name: "Banco Exemplo" },
				name: "Conta principal",
				type: "CHECKING",
			}),
		).toBe("Conta principal");
	});

	test("uses the institution name when the account has no title", () => {
		expect(
			getFinancialAccountDisplayName({
				institution: { id: "institution-id", name: "Banco Exemplo" },
				name: null,
				type: "CHECKING",
			}),
		).toBe("Banco Exemplo");
	});

	test("uses the institution name when the account title is blank", () => {
		expect(
			getFinancialAccountDisplayName({
				institution: { id: "institution-id", name: "Banco Exemplo" },
				name: "   ",
				type: "CREDIT_CARD",
			}),
		).toBe("Banco Exemplo");
	});

	test("uses the account type when title and institution are absent", () => {
		expect(getFinancialAccountDisplayName({ institution: null, name: null, type: "CHECKING" })).toBe(
			"Conta corrente",
		);
	});
});

describe("getFinancialAccountOptionLabel", () => {
	test("prefixes the account type to distinguish accounts in selectors", () => {
		expect(
			getFinancialAccountOptionLabel({
				institution: { id: "mercado-pago-id", name: "Mercado Pago" },
				name: null,
				type: "SAVINGS",
			}),
		).toBe("Poupança Mercado Pago");
		expect(
			getFinancialAccountOptionLabel({
				institution: { id: "mercado-pago-id", name: "Mercado Pago" },
				name: null,
				type: "CHECKING",
			}),
		).toBe("Conta Mercado Pago");
	});

	test("does not repeat the type when it is the only available account name", () => {
		expect(getFinancialAccountOptionLabel({ institution: null, name: null, type: "SAVINGS" })).toBe(
			"Poupança",
		);
	});
});

describe("getTransactionSourceAccounts", () => {
	test("includes cashback but excludes point and credit-card accounts", () => {
		const accounts = [
			{ id: "cashback", rewardsAccount: { kind: "CASHBACK" }, type: "REWARDS" },
			{ id: "points", rewardsAccount: { kind: "POINTS" }, type: "REWARDS" },
			{ id: "card", type: "CREDIT_CARD" },
			{ id: "checking", type: "CHECKING" },
		] as FinancialAccount[];

		expect(getTransactionSourceAccounts(accounts).map(account => account.id)).toEqual([
			"cashback",
			"checking",
		]);
	});
});

describe("getTransactionAccountTypeLabel", () => {
	test("identifies monetary rewards as cashback", () => {
		expect(getTransactionAccountTypeLabel("REWARDS", "CASHBACK")).toBe("Cashback");
		expect(getTransactionAccountTypeLabel("REWARDS", "POINTS")).toBe("Pontos / cashback");
	});
});

describe("getFinancialAccountSummaryName", () => {
	test("uses the account title or prefixes its type to the institution", () => {
		expect(
			getFinancialAccountSummaryName({
				institution: { name: "Banco Exemplo" },
				name: "Conta do dia a dia",
				type: "CHECKING",
			}),
		).toBe("Conta do dia a dia");
		expect(
			getFinancialAccountSummaryName({
				institution: { name: "Banco Exemplo" },
				name: null,
				type: "SAVINGS",
			}),
		).toBe("Poupança Banco Exemplo");
	});
});

describe("compareFinancialAccountsByDisplayName", () => {
	test("sorts accounts alphabetically by their final display names", () => {
		const accounts = [
			{ institution: { id: "zeta-id", name: "Zeta" }, name: null, type: "CHECKING" as const },
			{ institution: null, name: "Banco Central", type: "CHECKING" as const },
			{ institution: { id: "agil-id", name: "Ágil" }, name: null, type: "CHECKING" as const },
		];

		expect(
			accounts.toSorted(compareFinancialAccountsByDisplayName).map(getFinancialAccountDisplayName),
		).toEqual(["Ágil", "Banco Central", "Zeta"]);
	});
});

describe("compareFinancialAccountsByTitle", () => {
	test("sorts by the title shown on account cards", () => {
		const accounts = [
			{ institution: { id: "bank-id", name: "Banco Exemplo" }, name: null, type: "CHECKING" as const },
			{ institution: { id: "bank-id", name: "Banco Exemplo" }, name: null, type: "CREDIT_CARD" as const },
			{
				institution: { id: "bank-id", name: "Banco Exemplo" },
				name: "Aplicações",
				type: "INVESTMENT" as const,
			},
		];

		expect(accounts.toSorted(compareFinancialAccountsByTitle).map(getFinancialAccountTitle)).toEqual([
			"Aplicações",
			"Cartão de crédito",
			"Conta corrente",
		]);
	});
});

describe("compareFinancialAccountsByOptionLabel", () => {
	test("sorts accounts alphabetically by their selector labels", () => {
		const accounts = [
			{ institution: { id: "mercado-id", name: "Mercado Pago" }, name: null, type: "SAVINGS" as const },
			{ institution: { id: "nubank-id", name: "Nubank" }, name: null, type: "CHECKING" as const },
			{ institution: { id: "inter-id", name: "Inter" }, name: null, type: "CHECKING" as const },
		];

		expect(
			accounts.toSorted(compareFinancialAccountsByOptionLabel).map(getFinancialAccountOptionLabel),
		).toEqual(["Conta Inter", "Conta Nubank", "Poupança Mercado Pago"]);
	});
});

describe("calculateFinancialAccountBalances", () => {
	test("compounds account yield on weekdays and excludes user holidays", () => {
		const account = {
			balance: 0,
			createdAt: "2026-01-05T12:00:00",
			id: "checking",
			type: "CHECKING" as const,
			yieldFixedRate: 10,
			yieldPeriod: "MONTHLY" as const,
		};
		const today = new Date("2026-01-06T12:00:00");
		const transactions = [{ amount: 100, date: "2026-01-05", destinationFinancialAccountId: "checking" }];
		const dailyRate = 1.1 ** (1 / 21) - 1;

		expect(
			calculateFinancialAccountBalances([account] as never, transactions, [], [], today)[0]?.balance,
		).toBeCloseTo(100 * (1 + dailyRate) ** 2, 4);
		expect(
			calculateFinancialAccountBalances([account] as never, transactions, [], ["2026-01-06"], today)[0]
				?.balance,
		).toBeCloseTo(100 * (1 + dailyRate), 4);
	});

	test("reduces automatic yields by the configured tax rate", () => {
		const account = {
			balance: 0,
			createdAt: "2026-01-05T12:00:00",
			id: "checking",
			type: "CHECKING" as const,
			yieldFixedRate: 10,
			yieldPeriod: "MONTHLY" as const,
			yieldTaxRate: 15,
		};
		const dailyRate = 1.1 ** (1 / 21) - 1;

		expect(
			calculateFinancialAccountBalances(
				[account] as never,
				[{ amount: 100, date: "2026-01-05", destinationFinancialAccountId: "checking" }],
				[],
				[],
				new Date("2026-01-05T12:00:00"),
			)[0]?.balance,
		).toBeCloseTo(100 * (1 + dailyRate * 0.85), 4);
	});

	test("derives balances from account transactions", () => {
		const accounts = calculateFinancialAccountBalances(
			[
				{ balance: 999, id: "checking", type: "CHECKING" },
				{ balance: 999, id: "savings", type: "SAVINGS" },
				{ balance: 999, id: "card", type: "CREDIT_CARD" },
			] as never,
			[
				{ amount: 100, destinationFinancialAccountId: "checking" },
				{ amount: 25, originFinancialAccountId: "checking" },
				{ amount: 10, destinationFinancialAccountId: "savings", originFinancialAccountId: "checking" },
			],
		);

		expect(accounts.map(account => account.balance)).toEqual([65, 10, null]);
	});

	test("keeps the prior rate for yields already recorded in the statement", () => {
		const account = {
			balance: 0,
			id: "checking",
			type: "CHECKING" as const,
			yieldFixedRate: 20,
			yieldPeriod: "MONTHLY" as const,
			yieldRateHistories: [
				{ effectiveDate: "2026-01-05", yieldFixedRate: 10, yieldPeriod: "MONTHLY" as const },
				{ effectiveDate: "2026-01-06", yieldFixedRate: 20, yieldPeriod: "MONTHLY" as const },
			],
		};
		const transactions = [{ amount: 100, date: "2026-01-05", destinationFinancialAccountId: "checking" }];
		const monthlyTenPercentDailyRate = 1.1 ** (1 / 21) - 1;
		const monthlyTwentyPercentDailyRate = 1.2 ** (1 / 21) - 1;

		const entries = calculateFinancialAccountYieldEntries(
			account as never,
			transactions,
			[],
			new Date("2026-01-06T12:00:00"),
		);

		expect(entries.map(entry => entry.date)).toEqual(["2026-01-05", "2026-01-06"]);
		expect(entries[0]?.amount).toBeCloseTo(100 * monthlyTenPercentDailyRate, 10);
		expect(entries[1]?.amount).toBeCloseTo(
			100 * (1 + monthlyTenPercentDailyRate) * monthlyTwentyPercentDailyRate,
			10,
		);
	});

	test("includes manually created and edited yields in the statement", () => {
		const account = {
			balance: 0,
			id: "checking",
			type: "CHECKING" as const,
			yieldFixedRate: 10,
			yieldPeriod: "MONTHLY" as const,
		};
		const entries = calculateFinancialAccountYieldEntries(
			account as never,
			[{ amount: 100, date: "2026-01-05", destinationFinancialAccountId: "checking" }],
			[],
			new Date("2026-01-06T12:00:00"),
			[
				{
					amount: 1,
					date: "2026-01-05",
					financialAccountId: "checking",
					id: "automatic-edit",
					isExcluded: false,
					kind: "AUTOMATIC",
				},
				{
					amount: 2,
					date: "2026-01-06",
					financialAccountId: "checking",
					id: "manual-yield",
					isExcluded: false,
					kind: "MANUAL",
				},
			],
		);

		expect(entries.map(entry => [entry.id, entry.amount])).toEqual([
			["automatic-edit", 1],
			["automatic-yield-checking-2026-01-06", expect.any(Number)],
			["manual-yield", 2],
		]);
	});

	test("keeps rewards in native units and compounds cashback", () => {
		const today = new Date("2026-01-05T12:00:00");
		const accounts = calculateFinancialAccountBalances(
			[
				{
					balance: 0,
					id: "rewards",
					rewardsAccount: { initialBalance: 100, kind: "POINTS" },
					type: "REWARDS",
				},
			] as never,
			[],
			[
				{
					cashbackAccountId: "rewards",
					cashbackAmount: 10,
					cashbackYieldPeriod: "MONTHLY",
					cashbackYieldReferencePercentage: 50,
					cashbackYieldReferenceRate: 10,
					purchaseDate: "2026-01-05",
				},
			],
			[],
			today,
		);

		const dailyRate = 1.05 ** (1 / 21) - 1;
		expect(accounts[0]?.balance).toBeCloseTo(100 + 10 * (1 + dailyRate), 4);
	});

	test("uses institution brackets for checking accounts without a specific rule", () => {
		const accounts = calculateFinancialAccountBalances(
			[
				{
					balance: 0,
					id: "checking",
					institution: {
						id: "bank",
						name: "Banco",
						yieldPolicies: [
							{
								effectiveDate: "2026-01-05",
								rules: [
									{ upToBalance: 10_000, yieldFixedRate: 10 },
									{ upToBalance: null, yieldFixedRate: 20 },
								],
								yieldPeriod: "YEARLY",
							},
						],
					},
					type: "CHECKING",
				},
			] as never,
			[{ amount: 15_000, date: "2026-01-05", destinationFinancialAccountId: "checking" }],
			[],
			[],
			new Date("2026-01-05T12:00:00"),
		);
		const expected = 15_000 + 10_000 * (1.1 ** (1 / 252) - 1) + 5_000 * (1.2 ** (1 / 252) - 1);
		expect(accounts[0]?.balance).toBeCloseTo(expected, 4);
	});
});
