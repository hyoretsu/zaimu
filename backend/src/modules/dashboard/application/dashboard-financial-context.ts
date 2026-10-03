import {
	recurrenceAccountEffects,
	recurrenceDates,
	recurrenceNeedsConfiguration,
} from "@zaimu/finance/recurrence";
import { dateKey } from "./dashboard-calculations";
import type { loadDashboardData } from "./load-dashboard-data";

export function dashboardFinancialContext(
	loaded: Awaited<ReturnType<typeof loadDashboardData>>,
	range: { start: Date; end: Date },
	today: Date,
	projectionStart: Date,
	comparisonEnd: Date,
) {
	const { accounts, recurrences, loanPayments: payments } = loaded;
	const monetaryAccounts = accounts.filter(
		account => account.type !== "CREDIT_CARD" && account.type !== "INVESTMENT" && account.type !== "REWARDS",
	);
	const savingsAccounts = monetaryAccounts.filter(account => account.type === "SAVINGS");
	const accountAccounts = monetaryAccounts.filter(account => account.type !== "SAVINGS");
	const normalizedTransactions = loaded.flows.map(transaction => ({
		amount: Number(transaction.amount),
		date: transaction.date as Date,
		type: transaction.type as "EXPENSE" | "INCOME" | "TRANSFER",
	}));
	const linkedTransactionDates = new Set(
		loaded.linkedTransactions.map(
			transaction => `${transaction.sourceId}:${String(transaction.date).slice(0, 10)}`,
		),
	);
	const projectedMovements: Array<{
		amount: number;
		date: Date;
		type: "EXPENSE" | "INCOME";
	}> = [];

	for (const recurrence of recurrences) {
		if (
			recurrenceNeedsConfiguration(recurrence) ||
			recurrence.movement === "TRANSFER" ||
			recurrence.movement === "CARD_PURCHASE"
		)
			continue;
		for (const date of recurrenceDates(recurrence, dateKey(projectionStart), dateKey(comparisonEnd)))
			if (!linkedTransactionDates.has(`${recurrence.id}:${date}`))
				projectedMovements.push({
					amount: recurrence.amount,
					date: new Date(`${date}T12:00:00`),
					type: recurrence.movement === "INCOME" ? "INCOME" : "EXPENSE",
				});
	}
	for (const payment of payments.filter(
		item => !item.paidDate && item.dueDate >= projectionStart && item.dueDate <= comparisonEnd,
	))
		projectedMovements.push({
			amount: Number(payment.totalPaid),
			date: payment.dueDate,
			type: "EXPENSE",
		});
	for (const statement of loaded.projectedStatements.filter(
		item => item.dueDate >= projectionStart && item.dueDate <= comparisonEnd,
	)) {
		const outstanding = Math.max(0, statement.balanceAmount);
		if (outstanding)
			projectedMovements.push({ amount: outstanding, date: statement.dueDate, type: "EXPENSE" });
	}
	const comparisonTransactions = [...normalizedTransactions, ...projectedMovements];
	const todayKey = dateKey(today);
	const balanceRowsByDate = Map.groupBy(loaded.balanceRows, row => row.date);
	const historicalBalances = [...balanceRowsByDate].map(([date, rows]) => ({
		balances: new Map(rows.map(row => [row.accountId, Number(row.balance)])),
		date: new Date(`${date}T12:00:00`),
	}));
	const historicalMonetaryBalances = new Map(
		historicalBalances.map(({ balances: dateBalances, date }) => [
			dateKey(date),
			monetaryAccounts.reduce((sum, account) => sum + (dateBalances.get(account.id) ?? 0), 0),
		]),
	);
	const historicalBalanceBreakdowns = new Map(
		historicalBalances.map(({ balances: dateBalances, date }) => [
			dateKey(date),
			{
				accountBalance: accountAccounts.reduce(
					(sum, account) => sum + (dateBalances.get(account.id) ?? 0),
					0,
				),
				savingsBalance: savingsAccounts.reduce(
					(sum, account) => sum + (dateBalances.get(account.id) ?? 0),
					0,
				),
			},
		]),
	);
	const balancesAtRangeEnd =
		historicalBalances.find(item => dateKey(item.date) === dateKey(range.end))?.balances ??
		new Map<string, number>();
	const currentBalance = historicalMonetaryBalances.get(dateKey(today)) ?? 0;
	const balanceAt = (date: Date) => {
		const key = dateKey(date);
		const concreteBalance = historicalMonetaryBalances.get(key) ?? currentBalance;
		if (key <= todayKey) return concreteBalance;
		const projectionEffect = projectedMovements
			.filter(movement => {
				const movementKey = dateKey(movement.date);
				return movementKey > todayKey && movementKey <= key;
			})
			.reduce((sum, movement) => sum + (movement.type === "INCOME" ? movement.amount : -movement.amount), 0);
		return concreteBalance + projectionEffect;
	};
	const balanceBreakdownAt = (date: Date) => {
		const key = dateKey(date);
		const historical = historicalBalanceBreakdowns.get(key);
		if (key <= todayKey && historical) return historical;
		const effects = recurrenceAccountEffects(
			recurrences,
			dateKey(projectionStart),
			key,
			linkedTransactionDates,
		);
		const savingsBalance =
			(historicalBalanceBreakdowns.get(key)?.savingsBalance ??
				historicalBalanceBreakdowns.get(todayKey)?.savingsBalance ??
				0) +
			loaded.accounts
				.filter(account => account.type === "SAVINGS")
				.reduce((sum, account) => sum + (effects.get(account.id) ?? 0), 0);
		return { accountBalance: balanceAt(date) - savingsBalance, savingsBalance };
	};
	return {
		balanceAt,
		balanceBreakdownAt,
		balancesAtRangeEnd,
		comparisonTransactions,
		linkedTransactionDates,
		monetaryAccounts,
	};
}
