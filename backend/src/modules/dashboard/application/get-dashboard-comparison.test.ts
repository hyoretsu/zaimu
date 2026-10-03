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
			flows: [],
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
