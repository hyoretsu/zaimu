import { monthEnd } from "@zaimu/finance/monthly-budget";
import { addDays, startOfDay } from "date-fns";
import { dashboardCurrencyContext } from "~/modules/dashboard/application/dashboard-currency-context";
import { dashboardFinancialContext } from "~/modules/dashboard/application/dashboard-financial-context";
import { loadDashboardData } from "~/modules/dashboard/application/load-dashboard-data";

export async function getMonthlyBudgetSummary(userId: string, month: string, currency: string) {
	const today = startOfDay(new Date());
	const range = { end: new Date(`${monthEnd(month)}T23:59:59`), start: new Date(`${month}-01T00:00:00`) };
	const projectionStart = addDays(today, 1);
	const loaded = await loadDashboardData(
		userId,
		{
			balanceDates: [today],
			comparisonEnd: range.end,
			comparisonStart: range.start,
			periodEnd: range.end,
			periodStart: range.start,
			projectionStart,
			today,
		},
		true,
	);
	const money = await dashboardCurrencyContext(
		loaded,
		currency,
		today,
		range.end > today,
		undefined,
		monthEnd(month),
	);
	return dashboardFinancialContext(loaded, range, today, projectionStart, range.end, money).budgetSummary(
		month,
	);
}
