import { monthEnd } from "@zaimu/finance/monthly-budget";
import { getGuestDashboardFinancialContext } from "./dashboard-comparison";

export async function guestMonthlyBudgetSummary(month: string) {
	const context = await getGuestDashboardFinancialContext({
		endDate: monthEnd(month),
		periodsAfter: 0,
		periodsBefore: 0,
		startDate: `${month}-01`,
	});
	return context.budgetSummary(month);
}
