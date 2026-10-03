import { expect, test } from "bun:test";
import { dashboardFinancialContext } from "./dashboard-financial-context";
import type { loadDashboardData } from "./load-dashboard-data";

function loaded(): Awaited<ReturnType<typeof loadDashboardData>> {
	return {
		accounts: [
			{
				id: "cash",
				institutionId: null,
				institutionName: null,
				isPrimary: true,
				name: "Conta",
				type: "CHECKING",
			},
			{ id: "reserve", institutionId: null, institutionName: null, name: "Reserva", type: "SAVINGS" },
			{ id: "stock", institutionId: null, institutionName: null, name: "Investimento", type: "INVESTMENT" },
		],
		activityDates: [],
		balanceRows: [
			{ accountId: "cash", balance: 10, date: "2026-10-03" },
			{ accountId: "reserve", balance: 30, date: "2026-10-03" },
			{ accountId: "stock", balance: 20, date: "2026-10-03" },
		],
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
}
const today = new Date("2026-10-03T00:00:00");
const from = new Date("2026-10-04T00:00:00");
const through = new Date("2026-10-31T23:59:59");
test("all forecast account balances and chart totals consume reserves consistently", () => {
	const data = loaded();
	data.flows = [
		{
			amount: 45,
			date: new Date("2026-10-04T12:00:00"),
			originAccountId: "cash",
			recurring: true,
			type: "EXPENSE",
		},
	];
	const context = dashboardFinancialContext(data, { end: through, start: from }, today, from, through);
	expect(context.balanceAt(through)).toBe(15);
	expect(context.balanceBreakdownAt(through)).toEqual({
		accountBalance: 0,
		fixedIncomeBalance: 0,
		savingsBalance: 0,
		variableIncomeBalance: 15,
	});
	expect([...context.balancesAtRangeEnd.values()].reduce((sum, balance) => sum + balance, 0)).toBe(15);
	expect(context.comparisonTransactions).toHaveLength(1);
});
test("historical checkpoints change balance without fictitious income or expense", () => {
	const data = loaded();
	data.balanceRows.push({ accountId: "cash", balance: 1000, date: "2026-10-02" });
	const context = dashboardFinancialContext(
		data,
		{ end: today, start: new Date("2026-10-01") },
		today,
		from,
		through,
	);
	expect(context.balanceAt(new Date("2026-10-02T12:00:00"))).toBe(1000);
	expect(context.balanceAt(today)).toBe(60);
	expect(context.comparisonTransactions).toHaveLength(0);
});
