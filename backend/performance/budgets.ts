export interface PerformanceBudget {
	coldQueryCount: number;
	coldP95Ms: number;
	hotP95Ms: number;
	hotQueryCount: number;
	path: string;
}

export const performanceBudgets: Record<string, PerformanceBudget> = {
	accounts: {
		coldP95Ms: 1000,
		coldQueryCount: 5,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/financial-accounts/",
	},
	accountYields: {
		coldP95Ms: 1000,
		coldQueryCount: 2,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/financial-account-yields/?financialAccountId=perf-account-main&limit=100",
	},
	categories: { coldP95Ms: 1000, coldQueryCount: 1, hotP95Ms: 100, hotQueryCount: 0, path: "/categories/" },
	categoryDetail: {
		coldP95Ms: 1000,
		coldQueryCount: 1,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/categories/perf-category-1",
	},
	creditCardImports: {
		coldP95Ms: 1000,
		coldQueryCount: 3,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/credit-card-imports/",
	},
	creditCards: {
		coldP95Ms: 1000,
		coldQueryCount: 4,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/credit-cards/",
	},
	dashboard: { coldP95Ms: 1000, coldQueryCount: 4, hotP95Ms: 100, hotQueryCount: 0, path: "/dashboard/" },
	debts: { coldP95Ms: 1000, coldQueryCount: 4, hotP95Ms: 100, hotQueryCount: 0, path: "/debts/" },
	loanDetail: {
		coldP95Ms: 1000,
		coldQueryCount: 2,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/loans/perf-loan-001",
	},
	loanHistory: {
		coldP95Ms: 1000,
		coldQueryCount: 2,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/loans/perf-loan-001/history?limit=50",
	},
	loans: { coldP95Ms: 1000, coldQueryCount: 1, hotP95Ms: 100, hotQueryCount: 0, path: "/loans/" },
	stores: { coldP95Ms: 1000, coldQueryCount: 1, hotP95Ms: 100, hotQueryCount: 0, path: "/stores/" },
	transactionImports: {
		coldP95Ms: 1000,
		coldQueryCount: 3,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/transaction-imports/",
	},
	transactions: {
		coldP95Ms: 1000,
		coldQueryCount: 6,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/transactions/?limit=50",
	},
};
