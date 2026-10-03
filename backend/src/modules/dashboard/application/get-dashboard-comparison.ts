import { comparisonDuration } from "@zaimu/finance/comparison-periods";
import { addDays, startOfDay } from "date-fns";
import { buildComparisonPeriods, resolveDashboardRange } from "./dashboard-calculations";
import type { DashboardComparisonQuery } from "./dashboard-dtos";
import { dashboardFinancialContext } from "./dashboard-financial-context";
import { loadDashboardData } from "./load-dashboard-data";

export async function getDashboardComparison(
	userId: string,
	query: DashboardComparisonQuery,
	load = loadDashboardData,
) {
	const today = startOfDay(new Date());
	const range = resolveDashboardRange(query.startDate, query.endDate, today);
	const options = { ...comparisonDuration(range.start, range.end), ...query };
	const periods = buildComparisonPeriods({ ...options, base: range, initialBalance: 0, transactions: [] });
	const comparisonEnd = new Date(`${periods.at(-1)!.endDate}T23:59:59.999`);
	const projectionStart = addDays(today, 1);
	const loaded = await load(
		userId,
		{
			balanceDates: [
				today,
				addDays(range.start, -1),
				...periods.flatMap(item => [
					addDays(new Date(`${item.startDate}T12:00:00`), -1),
					new Date(`${item.endDate}T12:00:00`),
				]),
			],
			comparisonEnd,
			comparisonStart: new Date(`${periods[0]!.startDate}T00:00:00`),
			periodEnd: range.end,
			periodStart: range.start,
			projectionStart,
			today,
		},
		true,
	);
	const { balanceAt, balanceBreakdownAt, comparisonTransactions } = dashboardFinancialContext(
		loaded,
		range,
		today,
		projectionStart,
		comparisonEnd,
	);
	return buildComparisonPeriods({
		...options,
		base: range,
		initialBalance: balanceAt(addDays(range.start, -1)),
		transactions: comparisonTransactions,
	}).map(item => ({
		...item,
		endingBalance: balanceAt(new Date(`${item.endDate}T12:00:00`)),
		initialBalance: balanceAt(addDays(new Date(`${item.startDate}T12:00:00`), -1)),
		...balanceBreakdownAt(new Date(`${item.endDate}T12:00:00`)),
	}));
}
