import {
	nextRecurrenceDate,
	recurrenceAccountEffects,
	recurrenceDates,
	recurrenceNeedsConfiguration,
} from "@zaimu/finance/recurrence";
import { addDays, startOfDay } from "date-fns";
import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import {
	buildComparisonPeriods,
	comparisonRangeEnd,
	type DashboardForecast,
	dateKey,
	loadDashboardData,
	period,
	projectedCashFlowUntilMonthEnd,
	reconcilePeriodCashFlow,
	resolveDashboardRange,
} from "~/modules/dashboard/application";
import { distributedCache } from "~/shared/infra/cache";

const DateQuery = t.Optional(t.String({ format: "date" }));
const ForecastReturn = t.Object({
	amount: t.Number(),
	date: t.String(),
	direction: t.Union([t.Literal("INCOME"), t.Literal("EXPENSE")]),
	id: t.String(),
	name: t.String(),
	sourceId: t.String(),
	type: t.Union([
		t.Literal("CARD"),
		t.Literal("LOAN"),
		t.Literal("RECURRING"),
		t.Literal("SALARY"),
		t.Literal("SUBSCRIPTION"),
		t.Literal("TRANSACTION"),
	]),
});
const PeriodReturn = t.Object({
	accountBalance: t.Number(),
	endDate: t.String(),
	endingBalance: t.Number(),
	expenses: t.Number(),
	income: t.Number(),
	initialBalance: t.Number(),
	net: t.Number(),
	savingsBalance: t.Number(),
	startDate: t.String(),
});
export const DashboardReturn = t.Object({
	accounts: t.Array(
		t.Object({
			balance: t.Number(),
			id: t.String(),
			institutionName: t.Nullable(t.String()),
			name: t.Nullable(t.String()),
			type: t.String(),
		}),
	),
	balanceBreakdown: t.Object({ accountBalance: t.Number(), savingsBalance: t.Number() }),
	comparison: t.Array(PeriodReturn),
	creditCards: t.Array(
		t.Object({
			availableLimit: t.Number(),
			creditLimit: t.Number(),
			excludeFromTotals: t.Boolean(),
			financialAccountId: t.String(),
			id: t.String(),
			institutionName: t.Nullable(t.String()),
			name: t.Nullable(t.String()),
			statement: t.Nullable(t.Object({ balanceAmount: t.Number(), dueDate: t.String(), id: t.String() })),
		}),
	),
	dailyBalances: t.Array(t.Object({ balance: t.Number(), date: t.String() })),
	debts: t.Object({
		iOwe: t.Number(),
		net: t.Number(),
		owedToMe: t.Number(),
		people: t.Array(
			t.Object({
				balance: t.Number(),
				direction: t.Union([t.Literal("OWED"), t.Literal("OWES")]),
				id: t.String(),
				name: t.String(),
			}),
		),
	}),
	forecasts: t.Array(ForecastReturn),
	period: PeriodReturn,
	projectedCashFlowUntilMonthEnd: t.Object({
		expenses: t.Number(),
		income: t.Number(),
		net: t.Number(),
	}),
	totalAvailableCredit: t.Number(),
});
export type DashboardReturn = typeof DashboardReturn.static;

export const DashboardController = new Elysia({ prefix: "/dashboard" }).get(
	"/",
	async ({ query, request, set, status }) => {
		const userId = await requireUserId(request);
		const cached = await distributedCache.remember(
			userId,
			"dashboard",
			query,
			async (): Promise<DashboardReturn> => {
				const now = new Date();
				const today = startOfDay(now);
				const range = resolveDashboardRange(query.startDate, query.endDate, now);
				const comparisonEnd = new Date(Math.max(comparisonRangeEnd(range).getTime(), range.end.getTime()));
				const comparisonPeriods = buildComparisonPeriods({
					base: range,
					initialBalance: 0,
					transactions: [],
				});
				const comparisonStart = new Date(`${comparisonPeriods[0]!.startDate}T12:00:00`);
				const projectionStart = addDays(today, 1);
				const loaded = await loadDashboardData(userId, {
					balanceDates: [
						today,
						addDays(range.start, -1),
						range.end,
						...comparisonPeriods.map(item => new Date(`${item.endDate}T12:00:00`)),
					],
					comparisonEnd,
					comparisonStart,
					periodEnd: range.end,
					periodStart: range.start,
					projectionStart,
					today,
				});
				const { accounts, cards, recurrences, loanPayments: payments } = loaded;
				const cardsByAccountId = new Map(cards.map(card => [card.financialAccountId, card]));
				const statements = loaded.statements;
				const monetaryAccounts = accounts.filter(
					account =>
						account.type !== "CREDIT_CARD" && account.type !== "INVESTMENT" && account.type !== "REWARDS",
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
				const projectedCashFlow = projectedCashFlowUntilMonthEnd({
					today,
					transactions: comparisonTransactions,
				});
				const transactionListDates = [...loaded.activityDates];
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
						.reduce(
							(sum, movement) => sum + (movement.type === "INCOME" ? movement.amount : -movement.amount),
							0,
						);
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
				const periodTransactions = comparisonTransactions.filter(
					transaction =>
						transaction.date >= range.start &&
						transaction.date <= range.end &&
						transaction.type !== "TRANSFER",
				);
				const categorizedIncome = periodTransactions
					.filter(transaction => transaction.type === "INCOME")
					.reduce((sum, transaction) => sum + transaction.amount, 0);
				const categorizedExpenses = periodTransactions
					.filter(transaction => transaction.type === "EXPENSE")
					.reduce((sum, transaction) => sum + transaction.amount, 0);
				const endingBalance = balanceAt(range.end);
				const initialBalance = balanceAt(addDays(range.start, -1));
				const { expenses, income } = reconcilePeriodCashFlow({
					endingBalance,
					expenses: categorizedExpenses,
					income: categorizedIncome,
					initialBalance,
				});
				const dashboardPeriod = period({
					end: range.end,
					expenses,
					income,
					initialBalance,
					start: range.start,
				});
				dashboardPeriod.endingBalance = endingBalance;
				const balanceBreakdown = balanceBreakdownAt(range.end);
				const dailyBalances = [
					...new Set(
						transactionListDates
							.filter(date => date >= range.start && date <= range.end)
							.map(date => dateKey(date)),
					),
				]
					.toSorted()
					.map(date => ({ balance: balanceAt(new Date(`${date}T12:00:00`)), date }));

				const forecasts: DashboardForecast[] = [];

				for (const recurrence of recurrences) {
					if (recurrenceNeedsConfiguration(recurrence) || recurrence.movement === "TRANSFER") continue;
					let date = nextRecurrenceDate(recurrence, dateKey(projectionStart));
					while (date && linkedTransactionDates.has(`${recurrence.id}:${date}`))
						date = nextRecurrenceDate(recurrence, dateKey(addDays(new Date(`${date}T12:00:00`), 1)));
					if (date)
						forecasts.push({
							amount: recurrence.amount,
							date,
							direction: recurrence.movement === "INCOME" ? "INCOME" : "EXPENSE",
							id: `recurrence-${recurrence.id}`,
							name: recurrence.name,
							sourceId: recurrence.id,
							type: "RECURRING",
						});
				}
				for (const payment of payments.filter(item => !item.paidDate && item.dueDate >= today)) {
					forecasts.push({
						amount: Number(payment.totalPaid),
						date: dateKey(payment.dueDate),
						direction: "EXPENSE",
						id: `loan-${payment.id}`,
						name: String(payment.lender),
						sourceId: String(payment.loanId),
						type: "LOAN",
					});
				}
				for (const transaction of loaded.forecastTransactions)
					forecasts.push({
						amount: Number(transaction.amount),
						date: dateKey(transaction.date as Date),
						direction: transaction.type as "EXPENSE" | "INCOME",
						id: `transaction-${transaction.id}`,
						name: String(transaction.description ?? "Movimentação"),
						sourceId: String(transaction.id),
						type: "TRANSACTION",
					});
				const cardsWithStatements = cards.map(card => {
					const cardStatements = statements.filter(statement => statement.creditCardId === card.id);
					const statement =
						cardStatements
							.filter(item => item.dueDate >= today)
							.toSorted((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0] ??
						cardStatements.toSorted((left, right) => right.dueDate.getTime() - left.dueDate.getTime())[0];
					const used =
						cardStatements.reduce((sum, item) => sum + Math.round(Number(item.balanceAmount) * 100), 0) / 100;
					return {
						availableLimit: Math.max(0, Number(card.creditLimit) - used),
						creditLimit: Number(card.creditLimit),
						excludeFromTotals: card.excludeFromTotals,
						financialAccountId: card.financialAccountId,
						id: card.id,
						institutionName: card.institutionName,
						name: card.name,
						statement: statement
							? {
									balanceAmount: Math.max(0, statement.balanceAmount),
									dueDate: dateKey(statement.dueDate),
									id: statement.id,
								}
							: null,
					};
				});
				const people = loaded.debts
					.map(person => {
						const balance = Number(person.balance);
						return {
							balance,
							direction: balance >= 0 ? ("OWED" as const) : ("OWES" as const),
							id: person.id,
							name: person.name,
						};
					})
					.filter(person => person.balance !== 0);
				const owedToMe = people
					.filter(person => person.balance > 0)
					.reduce((sum, person) => sum + person.balance, 0);
				const iOwe = people
					.filter(person => person.balance < 0)
					.reduce((sum, person) => sum + Math.abs(person.balance), 0);
				return {
					accounts: monetaryAccounts.map(account => ({
						balance:
							(balancesAtRangeEnd.get(account.id) ?? 0) +
							(recurrenceAccountEffects(
								recurrences,
								dateKey(projectionStart),
								dateKey(range.end),
								linkedTransactionDates,
							).get(account.id) ?? 0),
						id: account.id,
						institutionName: account.institutionName,
						name: account.name,
						type: account.type,
					})),
					balanceBreakdown,
					comparison: buildComparisonPeriods({
						base: range,
						initialBalance: dashboardPeriod.initialBalance,
						transactions: comparisonTransactions,
					}).map(item => ({ ...item, ...balanceBreakdownAt(new Date(`${item.endDate}T12:00:00`)) })),
					creditCards: cardsWithStatements,
					dailyBalances,
					debts: { iOwe, net: owedToMe - iOwe, owedToMe, people },
					forecasts: forecasts.toSorted((left, right) => left.date.localeCompare(right.date)),
					period: { ...dashboardPeriod, ...balanceBreakdown },
					projectedCashFlowUntilMonthEnd: projectedCashFlow,
					totalAvailableCredit: cardsWithStatements
						.filter(card => !card.excludeFromTotals)
						.reduce((sum, card) => sum + card.availableLimit, 0),
				};
			},
		);
		set.headers.etag = cached.etag;
		set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
		if (request.headers.get("if-none-match") === cached.etag) {
			return status(304, null);
		}
		return cached.value;
	},
	{
		detail: { tags: ["Dashboard"] },
		query: t.Object({ endDate: DateQuery, startDate: DateQuery }),
		response: { 200: DashboardReturn, 304: t.Null() },
	},
);
