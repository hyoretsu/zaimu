import { dashboardCardForecasts, isCashFlowRecurrence } from "@zaimu/finance/dashboard-forecasts";
import { nextRecurrenceDate, recurrenceNeedsConfiguration } from "@zaimu/finance/recurrence";
import { addDays, startOfDay } from "date-fns";
import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { defaultCurrency } from "~/modules/currencies/application/currency-defaults";
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
import {
	DashboardConversionUnavailable,
	dashboardCurrencyContext,
} from "../../application/dashboard-currency-context";
import { PeriodReturn } from "../../application/dashboard-dtos";
import { nativeDashboardBooks } from "../../application/native-dashboard-books";
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
			currency: t.String(),
			id: t.String(),
			institutionName: t.Nullable(t.String()),
			name: t.Nullable(t.String()),
			type: t.String(),
		}),
	),
	balanceBreakdown: t.Nullable(
		t.Object({
			accountBalance: t.Number(),
			fixedIncomeBalance: t.Number(),
			savingsBalance: t.Number(),
			variableIncomeBalance: t.Number(),
		}),
	),
	consolidation: t.Object({
		forecastAvailable: t.Boolean(),
		histories: t.Array(
			t.Object({
				collectionId: t.String(),
				coveredDays: t.Number(),
				endDate: t.String(),
				requestedDays: t.Number(),
				startDate: t.String(),
				state: t.String(),
			}),
		),
		method: t.Literal("EXPONENTIAL_90_DAY_HALF_LIFE"),
		publishedDates: t.Record(t.String(), t.String()),
		unavailable: t.Boolean(),
	}),
	creditCards: t.Array(
		t.Object({
			availableLimit: t.Number(),
			creditLimit: t.Number(),
			currency: t.String(),
			excludeFromTotals: t.Boolean(),
			financialAccountId: t.String(),
			id: t.String(),
			institutionName: t.Nullable(t.String()),
			name: t.Nullable(t.String()),
			statement: t.Nullable(t.Object({ balanceAmount: t.Number(), dueDate: t.String(), id: t.String() })),
		}),
	),
	currency: t.String(),
	dailyBalances: t.Array(t.Object({ balance: t.Number(), date: t.String() })),
	debts: t.Nullable(
		t.Object({
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
	),
	forecasts: t.Array(ForecastReturn),
	nativeAsOf: t.String(),
	period: t.Nullable(PeriodReturn),
	projectedCashFlowUntilMonthEnd: t.Nullable(
		t.Object({
			expenses: t.Number(),
			income: t.Number(),
			net: t.Number(),
			recurringExpenses: t.Number(),
			recurringIncome: t.Number(),
		}),
	),
	referenceRatesAvailable: t.Boolean(),
	totalAvailableCredit: t.Nullable(t.Number()),
});
export type DashboardReturn = typeof DashboardReturn.static;

export const DashboardController = new Elysia({ prefix: "/dashboard" })
	.use(DashboardComparisonController)
	.get(
		"/",
		async ({ query, request, set }) => {
			const userId = await requireUserId(request);
			const consolidatedCurrency = await defaultCurrency(userId, request.headers.get("X-Currency"));
			const cached = await distributedCache.remember(
				userId,
				"dashboard",
				{ ...query, currency: consolidatedCurrency },
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
					const money = await dashboardCurrencyContext(
						loaded,
						consolidatedCurrency,
						today,
						comparisonEnd > today,
					);
					const consolidation = {
						forecastAvailable: money.forecastAvailable,
						histories: money.collections.map(row => ({
							collectionId: row.collectionId,
							coveredDays: row.progress.coveredDays,
							endDate: row.endDate,
							requestedDays: row.progress.requestedDays,
							startDate: row.startDate,
							state: row.progress.state,
						})),
						method: "EXPONENTIAL_90_DAY_HALF_LIFE" as const,
						publishedDates: money.publishedDates,
						unavailable: false,
					};
					try {
						const { cards, recurrences, loanPayments: payments } = loaded;
						const {
							linkedTransactionDates,
							comparisonTransactions,
							balancesAtRangeEnd,
							balanceAt,
							balanceBreakdownAt,
						} = dashboardFinancialContext(loaded, range, today, projectionStart, comparisonEnd, money);
						const projectedCashFlow = money.forecastAvailable
							? projectedCashFlowUntilMonthEnd({
									today,
									transactions: comparisonTransactions,
								})
							: null;
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
						if (money.forecastAvailable) {
							for (const recurrence of recurrences) {
								if (recurrenceNeedsConfiguration(recurrence) || !isCashFlowRecurrence(recurrence)) continue;
								let date = nextRecurrenceDate(recurrence, dateKey(projectionStart));
								while (date && linkedTransactionDates.has(`${recurrence.id}:${date}`))
									date = nextRecurrenceDate(recurrence, dateKey(addDays(new Date(`${date}T12:00:00`), 1)));
								if (date)
									forecasts.push({
										amount: money.convert(recurrence.amount, recurrence.currency ?? "BRL", date),
										date,
										direction: recurrence.movement === "INCOME" ? "INCOME" : "EXPENSE",
										id: `recurrence-${recurrence.id}`,
										name: recurrence.name,
										sourceId: recurrence.id,
										type: "RECURRING",
									});
							}
							for (const payment of payments.filter(
								item => !item.paidDate && item.dueDate >= projectionStart,
							)) {
								forecasts.push({
									amount: money.convert(
										Number(payment.totalPaid),
										payment.currency ?? "BRL",
										dateKey(payment.dueDate),
									),
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
									amount: money.convert(
										Number(transaction.amount),
										transaction.currency ?? "BRL",
										dateKey(transaction.date),
									),
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
								).map(row => ({
									...row,
									amount: money.convert(
										row.amount,
										cards.find(card => card.id === row.sourceId)?.currency ?? "BRL",
										row.date,
									),
								})),
							);
						}
						const nativeBooks = nativeDashboardBooks(loaded, range.end, balancesAtRangeEnd);
						const cardsWithStatements = nativeBooks.creditCards;
						const debtRows = loaded.debts
							.map(person => {
								const balance = money.convert(
									Number(person.balance),
									person.currency ?? "BRL",
									dateKey(today),
								);
								return {
									balance,
									direction: balance >= 0 ? ("OWED" as const) : ("OWES" as const),
									id: person.id,
									name: person.name,
								};
							})
							.filter(person => person.balance !== 0);
						const people = [...Map.groupBy(debtRows, row => row.id)].map(([id, rows]) => {
							const balance = rows.reduce((sum, row) => sum + row.balance, 0);
							return {
								...rows[0]!,
								balance,
								direction: balance >= 0 ? ("OWED" as const) : ("OWES" as const),
								id,
							};
						});
						const owedToMe = people
							.filter(person => person.balance > 0)
							.reduce((sum, person) => sum + person.balance, 0);
						const iOwe = people
							.filter(person => person.balance < 0)
							.reduce((sum, person) => sum + Math.abs(person.balance), 0);
						return {
							...nativeBooks,
							balanceBreakdown,
							consolidation,
							creditCards: cardsWithStatements,
							currency: consolidatedCurrency,
							dailyBalances,
							debts: { iOwe, net: owedToMe - iOwe, owedToMe, people },
							forecasts: forecasts.toSorted((left, right) => left.date.localeCompare(right.date)),
							period: { ...dashboardPeriod, ...balanceBreakdown },
							projectedCashFlowUntilMonthEnd: projectedCashFlow,
							referenceRatesAvailable: loaded.projectedYields?.available ?? false,
							totalAvailableCredit: cardsWithStatements
								.filter(card => !card.excludeFromTotals)
								.reduce(
									(sum, card) => sum + money.convert(card.availableLimit, card.currency, dateKey(today)),
									0,
								),
						};
					} catch (error) {
						if (!(error instanceof DashboardConversionUnavailable)) throw error;
						return {
							...nativeDashboardBooks(loaded, today),
							balanceBreakdown: null,
							consolidation: { ...consolidation, unavailable: true },
							currency: consolidatedCurrency,
							dailyBalances: [],
							debts: null,
							forecasts: [],
							period: null,
							projectedCashFlowUntilMonthEnd: null,
							referenceRatesAvailable: loaded.projectedYields?.available ?? false,
							totalAvailableCredit: null,
						};
					}
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
