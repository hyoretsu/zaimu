import { loanPlannerHorizon, type PlannerInput } from "@zaimu/finance/loan-planner";
import type { LoanPlannerSnapshot } from "@zaimu/finance/loan-planner-runtime";
import { dashboardCurrencyContext } from "~/modules/dashboard/application/dashboard-currency-context";
import { dashboardFinancialContext } from "~/modules/dashboard/application/dashboard-financial-context";
import { loadDashboardData } from "~/modules/dashboard/application/load-dashboard-data";
import { loadYieldAccounts } from "~/modules/reference-rates/application/reference-rate-jobs";
import { loadTaxCatalog } from "~/modules/taxes/catalog";
import { getCountryHolidays } from "~/modules/yield-calendar/catalog";
import { ensureProjectedCoverage } from "~/modules/yield-calendar/ensure-projected-coverage";
import { userFinancialDate } from "~/shared/application/financial-date";
import { queryRaw } from "~/shared/infra/sql";
import { loadLoanBook, loanReferenceContext } from "./loan-contracts";
export async function loanPlannerContext(userId: string, currency: string): Promise<LoanPlannerSnapshot> {
	const from = await userFinancialDate(userId);
	const today = new Date(`${from}T12:00:00`);
	const ids = await queryRaw<{ id: string }>('SELECT "id" FROM "Loan" WHERE "userId"=$1', [userId]);
	const books = await Promise.all(ids.map(row => loadLoanBook(userId, row.id)));
	const input: PlannerInput = {
		accounts: [],
		currency,
		dataIssues: [],
		eligibility: {
			accountIds: [],
			allAccounts: true,
			excludeAccountIds: [],
			includeAccountIds: [],
			includeInvestments: false,
		},
		from,
		loans: books.map(book => ({ book, paymentAccountId: "" })),
		movements: [],
		reserve: 0,
	};
	const through = loanPlannerHorizon(input);
	const end = new Date(`${through}T12:00:00`);
	const loaded = await loadDashboardData(
		userId,
		{
			balanceDates: [today],
			comparisonEnd: end,
			comparisonStart: today,
			periodEnd: end,
			periodStart: today,
			projectionStart: today,
			today,
		},
		true,
	);
	const money = await dashboardCurrencyContext(loaded, currency, today, true, undefined, through);
	loaded.loanPayments = [];
	const context = dashboardFinancialContext(loaded, { end, start: today }, today, today, end, money);
	input.accounts = context.forecastAccounts;
	const primary =
		loaded.accounts.find(row => row.isPrimary && !row.isHidden)?.id ??
		input.accounts.find(row => ["CHECKING", "CASH"].includes(row.type))?.id ??
		"";
	input.primaryAccountId = primary;
	input.loans.forEach(loan => {
		loan.paymentAccountId = primary;
	});
	input.movements = context.plannerMovements.filter(
		row => row.type !== "INCOME" || !("yieldIncome" in row && row.yieldIncome),
	);
	if (!money.forecastAvailable) input.dataIssues.push("Cotações necessárias indisponíveis");
	const [yieldAccounts, rates, taxes] = await Promise.all([
		loadYieldAccounts(input.accounts.map(row => row.id)),
		loanReferenceContext(from),
		loadTaxCatalog(),
	]);
	input.accounts = input.accounts.map(row => ({
		...row,
		yieldLots: yieldAccounts.find(account => account.id === row.id)?.yieldLots,
	}));
	const years = Array.from(
		{ length: end.getFullYear() - today.getFullYear() + 1 },
		(_, index) => today.getFullYear() + index,
	);
	const coverage = await ensureProjectedCoverage(yieldAccounts, years);
	for (const account of yieldAccounts)
		if (!coverage.get(account.id)) input.dataIssues.push("Calendário financeiro incompleto");
	const holidays = Object.fromEntries(
		await Promise.all(
			yieldAccounts.map(async account => [
				account.id,
				[...(await getCountryHolidays(account.countryCode!))],
			]),
		),
	);
	const currencies = new Set([
		...input.accounts.map(row => row.currency ?? "BRL"),
		...input.movements.map(row => row.currency ?? "BRL"),
		...books.map(book => book.versions.at(-1)!.terms.currency),
	]);
	const conversionRates: Record<string, number | null> = {};
	for (const source of currencies) {
		try {
			conversionRates[source] = money.factor(source, from);
		} catch {
			conversionRates[source] = null;
		}
	}
	return {
		capturedAt: new Date().toISOString(),
		conversionRates,
		holidays,
		input,
		observations: rates.observations,
		projections: rates.projections,
		taxDefinitions: taxes,
		yieldAccounts,
	};
}
