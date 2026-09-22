export interface PerformanceBudget {
	coldP95Ms: number;
	hotP95Ms: number;
	hotQueryCount: number;
	path: string;
}

export const performanceBudgets: Record<string, PerformanceBudget> = {
	accounts: { coldP95Ms: 1000, hotP95Ms: 100, hotQueryCount: 0, path: "/financial-accounts/" },
	creditCardImports: {
		coldP95Ms: 1000,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/credit-card-imports/",
	},
	creditCards: { coldP95Ms: 1000, hotP95Ms: 100, hotQueryCount: 0, path: "/credit-cards/" },
	dashboard: { coldP95Ms: 1000, hotP95Ms: 100, hotQueryCount: 0, path: "/dashboard/" },
	transactionImports: {
		coldP95Ms: 1000,
		hotP95Ms: 100,
		hotQueryCount: 0,
		path: "/transaction-imports/",
	},
	transactions: { coldP95Ms: 1000, hotP95Ms: 100, hotQueryCount: 0, path: "/transactions/?limit=50" },
};
