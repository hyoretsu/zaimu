import { addDays, startOfDay } from "date-fns";
import Elysia, { t } from "elysia";
import { getFinancialAccountBalancesAtDates } from "~/modules/accounts/application/get-financial-account-balances";
import { requireUserId } from "~/modules/auth";
import {
	buildComparisonPeriods,
	comparisonRangeEnd,
	type DashboardForecast,
	databaseDate,
	dateKey,
	nextOccurrence,
	occurrencesInRange,
	period,
	projectedCashFlowUntilMonthEnd,
	type RecurrenceFrequency,
	reconcilePeriodCashFlow,
	resolveDashboardRange,
} from "~/modules/dashboard/application";
import { materializeSalaryTransactions } from "~/modules/salaries/application/materialize-salary-transactions";
import { db, queryRows } from "~/shared/infra/sql";

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
	endDate: t.String(),
	endingBalance: t.Number(),
	expenses: t.Number(),
	income: t.Number(),
	initialBalance: t.Number(),
	net: t.Number(),
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
	async ({ query, request }) => {
		const userId = await requireUserId(request);
		await materializeSalaryTransactions(userId);
		const now = new Date();
		const today = startOfDay(now);
		const range = resolveDashboardRange(query.startDate, query.endDate, now);
		const accounts = await queryRows(
			db.sql.public.FinancialAccount.select("id", "institutionId", "name", "type")
				.where((f, fn) => fn.eq(f.userId, userId))
				.build(),
		);
		const accountIds = accounts.map(account => account.id);
		const institutionIds = accounts.flatMap(account =>
			account.institutionId ? [account.institutionId] : [],
		);
		const [
			institutions,
			cards,
			salaries,
			subscriptions,
			recurring,
			loans,
			transactions,
			creditPurchaseDates,
			debtPeople,
		] = await Promise.all([
			institutionIds.length
				? queryRows(
						db.sql.public.FinancialInstitution.select("id", "name")
							.where((f, fn) => fn.in(f.id, institutionIds))
							.build(),
					)
				: [],
			queryRows(
				db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (f, fn) =>
					fn.eq(f.CreditCard.financialAccountId, f.FinancialAccount.id),
				)
					.select(f => ({
						creditLimit: f.CreditCard.creditLimit,
						excludeFromTotals: f.CreditCard.excludeFromTotals,
						financialAccountId: f.CreditCard.financialAccountId,
						id: f.CreditCard.id,
						name: f.FinancialAccount.name,
					}))
					.where((f, fn) => fn.eq(f.FinancialAccount.userId, userId))
					.build(),
			),
			queryRows(
				db.sql.public.Salary.select(
					"id",
					"amount",
					"endDate",
					"frequency",
					"isActive",
					"payDay",
					"source",
					"startDate",
				)
					.where((f, fn) => fn.eq(f.userId, userId))
					.build(),
			),
			queryRows(
				db.sql.public.Subscription.select(
					"id",
					"amount",
					"billingDay",
					"endDate",
					"frequency",
					"isActive",
					"name",
					"startDate",
				)
					.where((f, fn) => fn.eq(f.userId, userId))
					.build(),
			),
			queryRows(
				db.sql.public.RecurringPayment.select(
					"id",
					"amount",
					"dayOfMonth",
					"dayOfWeek",
					"endDate",
					"frequency",
					"isActive",
					"name",
					"startDate",
				)
					.where((f, fn) => fn.eq(f.userId, userId))
					.build(),
			),
			queryRows(
				db.sql.public.Loan.select("id", "installmentAmount", "lender")
					.where((f, fn) => fn.eq(f.userId, userId))
					.build(),
			),
			accountIds.length
				? queryRows(
						db.sql.public.Transaction.select(
							"amount",
							"date",
							"description",
							"destinationFinancialAccountId",
							"id",
							"originFinancialAccountId",
							"recurrenceId",
							"salaryId",
							"salaryOccurrenceDate",
							"subscriptionId",
							"type",
						)
							.where((f, fn) =>
								fn.or(
									fn.in(f.originFinancialAccountId, accountIds),
									fn.in(f.destinationFinancialAccountId, accountIds),
								),
							)
							.build(),
					)
				: [],
			queryRows(
				db.sql.public.CreditPurchase.innerJoin(db.sql.public.CreditCardStatement, (f, fn) =>
					fn.eq(f.CreditPurchase.statementId, f.CreditCardStatement.id),
				)
					.innerJoin(db.sql.public.CreditCard, (f, fn) =>
						fn.eq(f.CreditCardStatement.creditCardId, f.CreditCard.id),
					)
					.innerJoin(db.sql.public.FinancialAccount, (f, fn) =>
						fn.eq(f.CreditCard.financialAccountId, f.FinancialAccount.id),
					)
					.select(f => ({ date: f.CreditPurchase.purchaseDate }))
					.where((f, fn) =>
						fn.and(fn.eq(f.FinancialAccount.userId, userId), fn.eq(f.CreditPurchase.currentInstallment, 1)),
					)
					.build(),
			),
			queryRows(
				db.sql.public.DebtPerson.select("id", "name")
					.where((f, fn) => fn.eq(f.userId, userId))
					.build(),
			),
		]);
		const institutionsById = new Map(institutions.map(institution => [institution.id, institution.name]));
		const institutionNameForAccount = (accountId: string) => {
			const account = accounts.find(item => item.id === accountId);
			return account?.institutionId ? (institutionsById.get(account.institutionId) ?? null) : null;
		};
		const [statements, payments, debtEvents] = await Promise.all([
			cards.length
				? queryRows(
						db.sql.public.CreditCardStatement.select(
							"creditCardId",
							"dueDate",
							"id",
							"paidAmount",
							"totalAmount",
						)
							.where((f, fn) =>
								fn.in(
									f.creditCardId,
									cards.map(card => card.id),
								),
							)
							.build(),
					)
				: [],
			loans.length
				? queryRows(
						db.sql.public.LoanPayment.select("loanId", "dueDate", "id", "paidDate", "totalPaid")
							.where((f, fn) =>
								fn.in(
									f.loanId,
									loans.map(loan => loan.id),
								),
							)
							.build(),
					)
				: [],
			debtPeople.length
				? queryRows(
						db.sql.public.DebtEvent.select("amount", "createdByUserId", "debtPersonId", "effect")
							.where((f, fn) =>
								fn.in(
									f.debtPersonId,
									debtPeople.map(person => person.id),
								),
							)
							.build(),
					)
				: [],
		]);
		const monetaryAccounts = accounts.filter(
			account =>
				account.type !== "CREDIT_CARD" && account.type !== "INVESTMENT" && account.type !== "REWARDS",
		);
		const normalizedTransactions = transactions.map(transaction => ({
			...transaction,
			amount: Number(transaction.amount),
			date: databaseDate(transaction.date),
			type: transaction.type as "EXPENSE" | "INCOME" | "TRANSFER",
		}));
		const comparisonEnd = comparisonRangeEnd(range);
		const projectionStart = addDays(today, 1);
		const linkedTransactionDates = new Set(
			normalizedTransactions.flatMap(transaction => {
				const sourceId = transaction.salaryId ?? transaction.subscriptionId ?? transaction.recurrenceId;
				return sourceId ? [`${sourceId}:${dateKey(transaction.date)}`] : [];
			}),
		);
		const projectedMovements: Array<{
			amount: number;
			date: Date;
			type: "EXPENSE" | "INCOME";
		}> = [];
		const addSchedule = (schedule: {
			amount: number;
			dayOfMonth?: null | number;
			dayOfWeek?: null | number;
			endDate?: Date | null;
			frequency: RecurrenceFrequency;
			sourceId: string;
			startDate: Date;
			type: "EXPENSE" | "INCOME";
		}) => {
			for (const occurrence of occurrencesInRange({
				...schedule,
				from: projectionStart,
				through: comparisonEnd,
			})) {
				if (!linkedTransactionDates.has(`${schedule.sourceId}:${dateKey(occurrence)}`))
					projectedMovements.push({ amount: schedule.amount, date: occurrence, type: schedule.type });
			}
		};
		for (const salary of salaries.filter(item => item.isActive))
			addSchedule({
				amount: Number(salary.amount),
				dayOfMonth: salary.payDay,
				endDate: salary.endDate,
				frequency: salary.frequency as RecurrenceFrequency,
				sourceId: salary.id,
				startDate: salary.startDate,
				type: "INCOME",
			});
		for (const subscription of subscriptions.filter(item => item.isActive))
			addSchedule({
				amount: Number(subscription.amount),
				dayOfMonth: subscription.billingDay,
				endDate: subscription.endDate,
				frequency: subscription.frequency as RecurrenceFrequency,
				sourceId: subscription.id,
				startDate: subscription.startDate,
				type: "EXPENSE",
			});
		for (const recurrence of recurring.filter(item => item.isActive))
			addSchedule({
				amount: Number(recurrence.amount),
				dayOfMonth: recurrence.dayOfMonth,
				dayOfWeek: recurrence.dayOfWeek,
				endDate: recurrence.endDate,
				frequency: recurrence.frequency as RecurrenceFrequency,
				sourceId: recurrence.id,
				startDate: recurrence.startDate,
				type: "EXPENSE",
			});
		for (const payment of payments.filter(
			item => !item.paidDate && item.dueDate >= projectionStart && item.dueDate <= comparisonEnd,
		))
			projectedMovements.push({
				amount: Number(payment.totalPaid),
				date: payment.dueDate,
				type: "EXPENSE",
			});
		for (const statement of statements.filter(
			item => item.dueDate >= projectionStart && item.dueDate <= comparisonEnd,
		)) {
			const outstanding = Math.max(0, Number(statement.totalAmount) - Number(statement.paidAmount));
			if (outstanding)
				projectedMovements.push({ amount: outstanding, date: statement.dueDate, type: "EXPENSE" });
		}
		const comparisonTransactions = [...normalizedTransactions, ...projectedMovements];
		const projectedCashFlow = projectedCashFlowUntilMonthEnd({
			today,
			transactions: comparisonTransactions,
		});
		const transactionListDates = [
			...normalizedTransactions.map(transaction => transaction.date),
			...creditPurchaseDates.map(purchase => databaseDate(purchase.date)),
		];
		const requestedBalanceDates = [
			today,
			addDays(range.start, -1),
			range.end,
			...transactionListDates.filter(date => date >= range.start && date <= range.end),
		];
		const todayKey = dateKey(today);
		const historicalDates = [
			...new Map(
				requestedBalanceDates
					.filter(date => dateKey(date) <= todayKey)
					.map(date => [dateKey(date), startOfDay(date)]),
			).values(),
		];
		const historicalBalances = await getFinancialAccountBalancesAtDates(accountIds, historicalDates);
		const historicalMonetaryBalances = new Map(
			historicalBalances.map(({ balances: dateBalances, date }) => [
				dateKey(date),
				monetaryAccounts.reduce((sum, account) => sum + (dateBalances.get(account.id) ?? 0), 0),
			]),
		);
		const balances =
			historicalBalances.find(item => dateKey(item.date) === dateKey(today))?.balances ??
			new Map<string, number>();
		const currentBalance = historicalMonetaryBalances.get(dateKey(today)) ?? 0;
		const monetaryAccountIds = new Set(monetaryAccounts.map(account => account.id));
		const transactionBalanceEffect = (transaction: (typeof normalizedTransactions)[number]) => {
			let effect = 0;
			if (
				transaction.destinationFinancialAccountId &&
				monetaryAccountIds.has(transaction.destinationFinancialAccountId)
			)
				effect += transaction.amount;
			if (
				transaction.originFinancialAccountId &&
				monetaryAccountIds.has(transaction.originFinancialAccountId)
			)
				effect -= transaction.amount;
			return effect;
		};
		const balanceAt = (date: Date) => {
			const key = dateKey(date);
			if (key <= todayKey) return historicalMonetaryBalances.get(key) ?? 0;
			const transactionEffect = normalizedTransactions
				.filter(transaction => {
					const transactionKey = dateKey(transaction.date);
					return transactionKey > todayKey && transactionKey <= key;
				})
				.reduce((sum, transaction) => sum + transactionBalanceEffect(transaction), 0);
			const projectionEffect = projectedMovements
				.filter(movement => {
					const movementKey = dateKey(movement.date);
					return movementKey > todayKey && movementKey <= key;
				})
				.reduce(
					(sum, movement) => sum + (movement.type === "INCOME" ? movement.amount : -movement.amount),
					0,
				);
			return currentBalance + transactionEffect + projectionEffect;
		};
		const periodTransactions = comparisonTransactions.filter(
			transaction =>
				transaction.date >= range.start && transaction.date <= range.end && transaction.type !== "TRANSFER",
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
		for (const salary of salaries.filter(item => item.isActive)) {
			const occurrence = nextOccurrence({
				dayOfMonth: salary.payDay,
				endDate: salary.endDate,
				frequency: salary.frequency as RecurrenceFrequency,
				from: today,
				startDate: salary.startDate,
			});
			if (occurrence)
				forecasts.push({
					amount: Number(salary.amount),
					date: dateKey(occurrence),
					direction: "INCOME",
					id: `salary-${salary.id}`,
					name: salary.source,
					sourceId: salary.id,
					type: "SALARY",
				});
		}
		for (const subscription of subscriptions.filter(item => item.isActive)) {
			const occurrence = nextOccurrence({
				dayOfMonth: subscription.billingDay,
				endDate: subscription.endDate,
				frequency: subscription.frequency as RecurrenceFrequency,
				from: today,
				startDate: subscription.startDate,
			});
			if (occurrence)
				forecasts.push({
					amount: Number(subscription.amount),
					date: dateKey(occurrence),
					direction: "EXPENSE",
					id: `subscription-${subscription.id}`,
					name: subscription.name,
					sourceId: subscription.id,
					type: "SUBSCRIPTION",
				});
		}
		for (const recurrence of recurring.filter(item => item.isActive)) {
			const occurrence = nextOccurrence({
				dayOfMonth: recurrence.dayOfMonth,
				dayOfWeek: recurrence.dayOfWeek,
				endDate: recurrence.endDate,
				frequency: recurrence.frequency as RecurrenceFrequency,
				from: today,
				startDate: recurrence.startDate,
			});
			if (occurrence)
				forecasts.push({
					amount: Number(recurrence.amount),
					date: dateKey(occurrence),
					direction: "EXPENSE",
					id: `recurring-${recurrence.id}`,
					name: recurrence.name,
					sourceId: recurrence.id,
					type: "RECURRING",
				});
		}
		for (const payment of payments.filter(item => !item.paidDate && item.dueDate >= today)) {
			const loan = loans.find(item => item.id === payment.loanId);
			if (loan)
				forecasts.push({
					amount: Number(payment.totalPaid),
					date: dateKey(payment.dueDate),
					direction: "EXPENSE",
					id: `loan-${payment.id}`,
					name: loan.lender,
					sourceId: loan.id,
					type: "LOAN",
				});
		}
		for (const transaction of normalizedTransactions.filter(
			item =>
				item.date > today &&
				!item.recurrenceId &&
				!item.salaryId &&
				!item.subscriptionId &&
				item.type !== "TRANSFER",
		))
			forecasts.push({
				amount: transaction.amount,
				date: dateKey(transaction.date),
				direction: transaction.type as "EXPENSE" | "INCOME",
				id: `transaction-${transaction.id}`,
				name: transaction.description ?? "Movimentação",
				sourceId: transaction.id,
				type: "TRANSACTION",
			});
		const cardsWithStatements = cards.map(card => {
			const cardStatements = statements.filter(statement => statement.creditCardId === card.id);
			const statement =
				cardStatements
					.filter(item => item.dueDate >= today)
					.toSorted((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0] ??
				cardStatements.toSorted((left, right) => right.dueDate.getTime() - left.dueDate.getTime())[0];
			const used = cardStatements.reduce(
				(sum, item) => sum + Math.max(0, Number(item.totalAmount) - Number(item.paidAmount)),
				0,
			);
			return {
				availableLimit: Math.max(0, Number(card.creditLimit) - used),
				creditLimit: Number(card.creditLimit),
				excludeFromTotals: card.excludeFromTotals,
				financialAccountId: card.financialAccountId,
				id: card.id,
				institutionName: institutionNameForAccount(card.financialAccountId),
				name: card.name,
				statement: statement
					? {
							balanceAmount: Math.max(0, Number(statement.totalAmount) - Number(statement.paidAmount)),
							dueDate: dateKey(statement.dueDate),
							id: statement.id,
						}
					: null,
			};
		});
		const people = debtPeople
			.map(person => {
				const balance = debtEvents
					.filter(event => event.debtPersonId === person.id)
					.reduce(
						(sum, event) =>
							sum + (event.createdByUserId === userId ? Number(event.effect) : -Number(event.effect)),
						0,
					);
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
				balance: balances.get(account.id) ?? 0,
				id: account.id,
				institutionName: institutionNameForAccount(account.id),
				name: account.name,
				type: account.type,
			})),
			comparison: buildComparisonPeriods({
				base: range,
				initialBalance: dashboardPeriod.initialBalance,
				transactions: comparisonTransactions,
			}),
			creditCards: cardsWithStatements,
			dailyBalances,
			debts: { iOwe, net: owedToMe - iOwe, owedToMe, people },
			forecasts: forecasts.toSorted((left, right) => left.date.localeCompare(right.date)),
			period: dashboardPeriod,
			projectedCashFlowUntilMonthEnd: projectedCashFlow,
			totalAvailableCredit: cardsWithStatements
				.filter(card => !card.excludeFromTotals)
				.reduce((sum, card) => sum + card.availableLimit, 0),
		};
	},
	{
		detail: { tags: ["Dashboard"] },
		query: t.Object({ endDate: DateQuery, startDate: DateQuery }),
		response: DashboardReturn,
	},
);
