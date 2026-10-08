import { dailyForecast, type ForecastMovement, forecastBreakdown } from "@zaimu/finance/daily-forecast";
import { recurrenceDates, recurrenceNeedsConfiguration } from "@zaimu/finance/recurrence";
import { dateKey } from "./dashboard-calculations";
import type { DashboardCurrencyContext } from "./dashboard-currency-context";
import type { loadDashboardData } from "./load-dashboard-data";

export function dashboardFinancialContext(
	loaded: Awaited<ReturnType<typeof loadDashboardData>>,
	range: { start: Date; end: Date },
	today: Date,
	projectionStart: Date,
	comparisonEnd: Date,
	money?: DashboardCurrencyContext,
) {
	if (money?.forecastAvailable && loaded.projectStatements)
		loaded.projectedStatements = loaded.projectStatements(
			(amount, source, target, date) => (amount * money.factor(source, date)) / money.factor(target, date),
		);
	const { accounts, recurrences, loanPayments: payments } = loaded;
	const monetaryAccounts = accounts.filter(
		account => account.type !== "CREDIT_CARD" && account.type !== "REWARDS",
	);

	const normalizedTransactions = loaded.flows.map(transaction => ({
		...transaction,
		amount: Number(transaction.amount),
		date: transaction.date as Date,
		type: transaction.type as "EXPENSE" | "INCOME" | "TRANSFER",
	}));
	const linkedTransactionDates = new Set(
		loaded.linkedTransactions.map(
			transaction => `${transaction.sourceId}:${String(transaction.date).slice(0, 10)}`,
		),
	);
	const projectedMovements: Array<Omit<ForecastMovement, "date"> & { date: Date }> = [];

	for (const recurrence of recurrences) {
		if (recurrenceNeedsConfiguration(recurrence) || recurrence.movement === "CARD_PURCHASE") continue;
		for (const date of recurrenceDates(recurrence, dateKey(projectionStart), dateKey(comparisonEnd)))
			if (!linkedTransactionDates.has(`${recurrence.id}:${date}`))
				projectedMovements.push({
					amount: recurrence.amount,
					cardPayment: recurrence.movement === "CARD_PAYMENT",
					currency: recurrence.currency ?? "BRL",
					date: new Date(`${date}T12:00:00`),
					destinationAccountId: recurrence.destinationFinancialAccountId,
					originAccountId: recurrence.originFinancialAccountId,
					recurring: true,
					...(recurrence.movement === "CARD_PAYMENT"
						? {
								recurringAmount:
									loaded.projectedCardPaymentAmounts?.get(`forecast:${recurrence.id}:${date}`) ?? 0,
							}
						: {}),
					type:
						recurrence.movement === "TRANSFER"
							? "TRANSFER"
							: recurrence.movement === "INCOME"
								? "INCOME"
								: "EXPENSE",
				});
	}
	for (const payment of payments.filter(
		item => !item.paidDate && item.dueDate >= projectionStart && item.dueDate <= comparisonEnd,
	))
		projectedMovements.push({
			amount: Number(payment.totalPaid),
			currency: payment.currency ?? "BRL",
			date: payment.dueDate,
			type: "EXPENSE",
		});
	for (const statement of loaded.projectedStatements.filter(
		item => item.dueDate >= projectionStart && item.dueDate <= comparisonEnd,
	)) {
		const outstanding = Math.max(0, statement.balanceAmount);
		if (outstanding)
			projectedMovements.push({
				amount: outstanding,
				cardPayment: true,
				currency: loaded.cards.find(card => card.id === statement.creditCardId)?.currency ?? "BRL",
				date: statement.dueDate,
				originAccountId:
					loaded.cards.find(card => card.id === statement.creditCardId)?.paymentAccountId ??
					accounts.find(account => account.isDefaultForStatements && !account.isHidden)?.id ??
					accounts.find(account => account.isPrimary && !account.isHidden)?.id,
				recurringAmount: statement.recurringAmount,
				type: "EXPENSE",
			});
	}
	const comparisonTransactions = [...normalizedTransactions, ...projectedMovements];
	const todayKey = dateKey(today);
	const balanceRowsByDate = Map.groupBy(
		loaded.balanceRows.filter(row => !money || row.date <= todayKey),
		row => row.date,
	);
	const historicalBalances = [...balanceRowsByDate].map(([date, rows]) => ({
		balances: new Map(rows.map(row => [row.accountId, Number(row.balance)])),
		date: new Date(`${date}T12:00:00`),
	}));
	const historicalMonetaryBalances = new Map(
		historicalBalances.map(({ balances: dateBalances, date }) => [
			dateKey(date),
			monetaryAccounts.reduce(
				(sum, account) =>
					sum +
					(money?.convert(dateBalances.get(account.id) ?? 0, account.currency ?? "BRL", dateKey(date)) ??
						dateBalances.get(account.id) ??
						0),
				0,
			),
		]),
	);
	const todayBalances =
		historicalBalances.find(item => dateKey(item.date) === todayKey)?.balances ?? new Map<string, number>();
	const forecastAccounts = monetaryAccounts.map(account => ({
		...account,
		balance: todayBalances.get(account.id) ?? 0,
	}));
	const forecastDays =
		money && !money.forecastAvailable
			? []
			: dailyForecast({
					accounts: forecastAccounts,
					currency: money?.currency,
					from: dateKey(projectionStart),
					movements: comparisonTransactions
						.filter(movement => dateKey(movement.date) > todayKey)
						.map(movement => ({ ...movement, date: dateKey(movement.date) })),
					netYield: loaded.projectedYields?.netYield,
					primaryAccountId: accounts.find(account => account.isPrimary)?.id,
					rate: money?.factor,
					through: dateKey(comparisonEnd),
				});
	const incomeByDate = new Map<string, number>();
	for (const movement of comparisonTransactions)
		if (movement.type === "INCOME") {
			const key = dateKey(movement.date);
			incomeByDate.set(
				key,
				(incomeByDate.get(key) ?? 0) +
					(money?.convert(movement.amount, movement.currency ?? "BRL", key) ?? movement.amount),
			);
		}
	for (const day of forecastDays) {
		const originalIncome = incomeByDate.get(day.date) ?? 0;
		const yieldedIncome = day.income - originalIncome;
		if (yieldedIncome > 0)
			projectedMovements.push({
				amount: yieldedIncome,
				currency: money?.currency,
				date: new Date(`${day.date}T12:00:00`),
				type: "INCOME",
			});
		if (yieldedIncome > 0) comparisonTransactions.push(projectedMovements.at(-1)!);
	}
	const forecastByDate = new Map(forecastDays.map(day => [day.date, day]));
	const balancesAtRangeEnd =
		forecastByDate.get(dateKey(range.end))?.balances ??
		historicalBalances.find(item => dateKey(item.date) === dateKey(range.end))?.balances ??
		todayBalances;
	const currentBalance = historicalMonetaryBalances.get(todayKey) ?? 0;
	const balanceAt = (date: Date) => {
		if (money && dateKey(date) > todayKey && !money.forecastAvailable)
			money.factor(
				monetaryAccounts.find(account => account.currency !== money.currency)?.currency ?? "BRL",
				dateKey(date),
			);
		return (
			forecastByDate.get(dateKey(date))?.totalBalance ??
			historicalMonetaryBalances.get(dateKey(date)) ??
			currentBalance
		);
	};
	const balanceBreakdownAt = (date: Date) => {
		const key = dateKey(date);
		const projected = forecastByDate.get(key);
		if (projected)
			return {
				accountBalance: projected.accountBalance,
				fixedIncomeBalance: projected.fixedIncomeBalance,
				savingsBalance: projected.savingsBalance,
				variableIncomeBalance: projected.variableIncomeBalance,
			};
		const balances = historicalBalances.find(item => dateKey(item.date) === key)?.balances ?? todayBalances;
		const { totalBalance: _, ...breakdown } = forecastBreakdown(
			forecastAccounts,
			balances,
			0,
			money ? { currency: money.currency, rate: source => money.factor(source, key) } : undefined,
		);
		return breakdown;
	};
	return {
		balanceAt,
		balanceBreakdownAt,
		balancesAtRangeEnd,
		comparisonTransactions: money
			? comparisonTransactions
					.filter(row => money.forecastAvailable || dateKey(row.date) <= todayKey)
					.map(row => ({
						...row,
						amount: money.convert(row.amount, row.currency ?? "BRL", dateKey(row.date)),
						currency: money.currency,
						recurringAmount:
							row.recurringAmount == null
								? undefined
								: money.convert(row.recurringAmount, row.currency ?? "BRL", dateKey(row.date)),
					}))
			: comparisonTransactions,
		linkedTransactionDates,
		monetaryAccounts,
	};
}
