export interface DailyAccountBalance {
	accountId: string;
	balance: number | string;
	currency: string;
	date: string;
}

export function dailyBalanceSummary(rows: DailyAccountBalance[], date: string) {
	const accountEndingBalances = rows
		.filter(row => row.date === date)
		.map(row => ({
			amount: Number(row.balance),
			currency: row.currency,
			financialAccountId: row.accountId,
		}));
	const endingBalances = [...Map.groupBy(accountEndingBalances, row => row.currency)].map(
		([currency, values]) => ({
			amount: values.reduce((sum, row) => sum + row.amount, 0),
			currency,
		}),
	);
	return {
		accountEndingBalances,
		endingBalance: endingBalances.find(row => row.currency === "BRL")?.amount ?? 0,
		endingBalances,
	};
}
