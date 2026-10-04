import { dashboardCardForecasts, isCashFlowRecurrence } from "@zaimu/finance/dashboard-forecasts";
import { nextRecurrenceDate, recurrenceNeedsConfiguration } from "@zaimu/finance/recurrence";
import { addDays, startOfDay } from "date-fns";
import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import {
	comparisonRangeEnd,
	type DashboardForecast,
	dashboardFinancialContext,
	dateKey,
	loadDashboardData,
	period,
	projectedCashFlowUntilMonthEnd,
	resolveDashboardRange,
} from "~/modules/dashboard/application";
import { distributedCache } from "~/shared/infra/cache";
import { PeriodReturn } from "../../application/dashboard-dtos";
import { DashboardComparisonController } from "./DashboardComparisonController";

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
	balanceBreakdown: t.Object({
		accountBalance: t.Number(),
		fixedIncomeBalance: t.Number(),
		savingsBalance: t.Number(),
		variableIncomeBalance: t.Number(),
	}),
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
		recurringExpenses: t.Number(),
		recurringIncome: t.Number(),
	}),
	referenceRatesAvailable: t.Boolean(),
	totalAvailableCredit: t.Number(),
});
export type DashboardReturn = typeof DashboardReturn.static;

export const DashboardController = new Elysia({ prefix: "/dashboard" })
	.use(DashboardComparisonController)
	.get(
		"/",
		async ({ query, request, set }) => {
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
					const comparisonStart = new Date(Math.min(range.start.getTime(), today.getTime()));
					const projectionStart = addDays(today, 1);
					const loaded = await loadDashboardData(userId, {
						balanceDates: [today, addDays(range.start, -1), range.end],
						comparisonEnd,
						comparisonStart,
						periodEnd: range.end,
						periodStart: range.start,
						projectionStart,
						today,
					});
					const { accounts, cards, recurrences, loanPayments: payments } = loaded;
					const statements = loaded.statements;
					const {
						monetaryAccounts,
						linkedTransactionDates,
						comparisonTransactions,
						balancesAtRangeEnd,
						balanceAt,
						balanceBreakdownAt,
					} = dashboardFinancialContext(loaded, range, today, projectionStart, comparisonEnd);
					const projectedCashFlow = projectedCashFlowUntilMonthEnd({
						today,
						transactions: comparisonTransactions,
					});
					const transactionListDates = loaded.activityDates;
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
					const expenses = categorizedExpenses;
					const income = categorizedIncome;
					const dashboardPeriod = period({
						end: range.end,
						expenses,
						income,
						initialBalance,
						start: range.start,
					});
					dashboardPeriod.endingBalance = endingBalance;
					dashboardPeriod.cardExpenses = periodTransactions
						.filter(item => item.type === "EXPENSE" && item.cardPayment)
						.reduce((sum, item) => sum + item.amount, 0);
					dashboardPeriod.recurringCardExpenses = periodTransactions
						.filter(item => item.type === "EXPENSE" && item.cardPayment)
						.reduce((sum, item) => sum + (item.recurringAmount ?? (item.recurring ? item.amount : 0)), 0);
					dashboardPeriod.recurringIncome = periodTransactions
						.filter(transaction => transaction.type === "INCOME")
						.reduce(
							(sum, transaction) =>
								sum + (transaction.recurringAmount ?? (transaction.recurring ? transaction.amount : 0)),
							0,
						);
					dashboardPeriod.recurringExpenses = periodTransactions
						.filter(transaction => transaction.type === "EXPENSE")
						.reduce(
							(sum, transaction) =>
								sum + (transaction.recurringAmount ?? (transaction.recurring ? transaction.amount : 0)),
							0,
						);
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
						if (recurrenceNeedsConfiguration(recurrence) || !isCashFlowRecurrence(recurrence)) continue;
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
					for (const payment of payments.filter(item => !item.paidDate && item.dueDate >= projectionStart)) {
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
					forecasts.push(
						...dashboardCardForecasts(
							loaded.projectedStatements.map(statement => ({
								...statement,
								dueDate: dateKey(statement.dueDate),
							})),
							cards,
							dateKey(today),
						),
					);
					const cardsWithStatements = cards.map(card => {
						const cardStatements = statements.filter(statement => statement.creditCardId === card.id);
						const statement =
							cardStatements
								.filter(item => item.dueDate >= today)
								.toSorted((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0] ??
							cardStatements.toSorted((left, right) => right.dueDate.getTime() - left.dueDate.getTime())[0];
						const used =
							cardStatements.reduce((sum, item) => sum + Math.round(Number(item.balanceAmount) * 100), 0) /
							100;
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
							balance: balancesAtRangeEnd.get(account.id) ?? 0,
							id: account.id,
							institutionName: account.institutionName,
							name: account.name,
							type: account.type,
						})),
						balanceBreakdown,
						creditCards: cardsWithStatements,
						dailyBalances,
						debts: { iOwe, net: owedToMe - iOwe, owedToMe, people },
						forecasts: forecasts.toSorted((left, right) => left.date.localeCompare(right.date)),
						period: { ...dashboardPeriod, ...balanceBreakdown },
						projectedCashFlowUntilMonthEnd: projectedCashFlow,
						referenceRatesAvailable: loaded.projectedYields?.available ?? false,
						totalAvailableCredit: cardsWithStatements
							.filter(card => !card.excludeFromTotals)
							.reduce((sum, card) => sum + card.availableLimit, 0),
					};
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return null;
			}
			return cached.value;
		},
		{
			detail: { tags: ["Dashboard"] },
			query: t.Object({ endDate: DateQuery, startDate: DateQuery }),
			response: { 200: DashboardReturn, 304: t.Null() },
		},
	);
