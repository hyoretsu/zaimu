import { expect, test } from "bun:test";
import { getDashboardComparison } from "./get-dashboard-comparison";
import type { loadDashboardData } from "./load-dashboard-data";

test("comparison response contains only selected series with calendar quarter boundaries", async () => {
	let comparisonOnly: boolean | undefined;
	const load: typeof loadDashboardData = async (_userId, range, mode) => {
		comparisonOnly = mode;
		expect(range.balanceDates).toHaveLength(8);
		return {
			accounts: [],
			activityDates: [],
			balanceRows: [],
			cards: [],
			debts: [],
			flows: [
				{ amount: 5100, date: new Date("2026-02-01T12:00:00"), recurring: true, type: "INCOME" },
				{ amount: 618.36, date: new Date("2026-02-01T12:00:00"), type: "INCOME", yieldIncome: true },
				{ amount: 200, date: new Date("2026-02-01T12:00:00"), type: "INCOME" },
			],
			forecastTransactions: [],
			linkedTransactions: [],
			loanPayments: [],
			projectedStatements: [],
			projectedYields: null,
			recurrences: [],
			recurring: [],
			salaries: [],
			statements: [],
			subscriptions: [],
		};
	};
	const result = await getDashboardComparison(
		"user",
		{ endDate: "2026-03-31", periodsAfter: 1, periodsBefore: 1, startDate: "2026-01-01" },
		load,
	);
	expect(comparisonOnly).toBe(true);
	expect(result).toHaveLength(3);
	expect(result.map(item => [item.startDate, item.endDate])).toEqual([
		["2025-10-01", "2025-12-31"],
		["2026-01-01", "2026-03-31"],
		["2026-04-01", "2026-06-30"],
	]);
	expect(Object.keys(result[1]!).sort()).toEqual([
		"accountBalance",
		"cardExpenses",
		"endDate",
		"endingBalance",
		"expenses",
		"fixedIncomeBalance",
		"income",
		"initialBalance",
		"net",
		"recurringCardExpenses",
		"recurringExpenses",
		"recurringIncome",
		"savingsBalance",
		"startDate",
		"variableIncomeBalance",
	]);
});

test("budget comparison excludes yields but retains extra receipts", async () => {
	const load = (async () => ({
		accounts: [],
		activityDates: [],
		balanceRows: [],
		cards: [],
		debts: [],
		flows: [
			{ amount: 5100, date: new Date("2026-02-01T12:00:00"), recurring: true, type: "INCOME" },
			{ amount: 618.36, date: new Date("2026-02-01T12:00:00"), type: "INCOME", yieldIncome: true },
			{ amount: 200, date: new Date("2026-02-01T12:00:00"), type: "INCOME" },
		],
		forecastTransactions: [],
		linkedTransactions: [],
		loanPayments: [],
		projectedStatements: [],
		projectedYields: null,
		recurrences: [],
		recurring: [],
		salaries: [],
		statements: [],
		subscriptions: [],
	})) as typeof loadDashboardData;
	const query = { endDate: "2026-02-28", periodsAfter: 0, periodsBefore: 0, startDate: "2026-02-01" };
	expect((await getDashboardComparison("user", query, load))[0]!.income).toBe(5918.36);
	const budget = (await getDashboardComparison("user", { ...query, excludeYields: true }, load))[0]!;
	expect(budget.income).toBe(5300);
	expect(budget.recurringIncome).toBe(5100);
});
