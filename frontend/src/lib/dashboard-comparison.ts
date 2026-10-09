import { forecastCardPayments, recurringCardPaymentAmounts } from "@zaimu/finance/card-forecast";
import { comparisonDuration, comparisonIntervals } from "@zaimu/finance/comparison-periods";
import { creditBookRewards } from "@zaimu/finance/credit-book";
import { dailyForecast, type ForecastMovement, forecastBreakdown } from "@zaimu/finance/daily-forecast";
import { projectedNetYield, type ReferenceRateType } from "@zaimu/finance/projected-yield";
import { recurrenceDates, recurrenceNeedsConfiguration } from "@zaimu/finance/recurrence";
import { pendingRecurrenceDates, projectRecurrenceCreditBook } from "@zaimu/finance/recurrence-projection";
import { addDays, format, startOfDay } from "date-fns";
import type { DashboardPeriod, FinancialAccountYield, FinancialAccountYieldHoliday } from "./api";
import { activeCurrency } from "./currency-context";
import { GuestConversionUnavailable, guestDashboardCurrencyContext } from "./dashboard-currency-context";
import { dataService } from "./dataService";
import {
	calculateFinancialAccountBalances,
	calculateFinancialAccountYieldEntries,
} from "./financial-account";
import { loanAccountMovements } from "./loan-account-movements";
import {
	localAccounts,
	localCreditBooks,
	localLoanPayments,
	localMeta,
	localRecurrenceOccurrences,
	readLocalCreditBook,
} from "./localStorage";
import { refreshReferenceRateAverages } from "./reference-rate-averages";

export interface DashboardComparisonParameters {
	endDate: string;
	periodsAfter: number;
	periodsBefore: number;
	startDate: string;
}

export async function getGuestDashboardFinancialContext(
	parameters: DashboardComparisonParameters,
	projectionThrough?: string,
) {
	const [
		accountRows,
		transactions,
		recurrences,
		cards,
		bookRows,
		paymentRows,
		occurrenceRows,
		holidays,
		yields,
	] = await Promise.all([
		localAccounts.getAll(),
		dataService.transactions.getAll(),
		dataService.recurrences.getAll(),
		dataService.creditCards.getAll(),
		localCreditBooks.getAll(),
		localLoanPayments.getAll(),
		localRecurrenceOccurrences.getAll(),
		localMeta.get("financial-account-yield-holidays"),
		localMeta.get("financial-account-yields"),
	]);
	const key = (date: Date) => format(date, "yyyy-MM-dd");
	const start = new Date(`${parameters.startDate}T00:00:00`);
	const end = new Date(`${parameters.endDate}T00:00:00`);
	const periods = comparisonIntervals(start, { ...comparisonDuration(start, end), ...parameters });
	const through = new Date(
		Math.max(
			periods.at(-1)!.end.getTime(),
			projectionThrough ? new Date(`${projectionThrough}T23:59:59`).getTime() : 0,
			new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).getTime(),
		),
	);
	const today = startOfDay(new Date());
	const projectionStart = addDays(today, 1);
	const occurrences = occurrenceRows.map(row => row.data);
	const linked = new Set([
		...occurrences.map(row => `${row.recurrenceId}:${row.date}`),
		...transactions
			.filter(row => row.recurrenceId)
			.map(row => `${row.recurrenceId}:${row.recurrenceOccurrenceDate ?? row.date.slice(0, 10)}`),
	]);
	const accounts = accountRows.filter(row => !row.data.isHidden).map(row => row.data);
	const historicalAccountsAt = (date: Date) =>
		calculateFinancialAccountBalances(
			accounts,
			[...transactions, ...loanAccountMovements(paymentRows.map(row => row.data))],
			bookRows.flatMap(row => creditBookRewards(row.data)),
			(holidays as FinancialAccountYieldHoliday[] | null)?.map(row => row.date) ?? [],
			date,
			(yields as FinancialAccountYield[] | null) ?? [],
		);
	const current = historicalAccountsAt(today);
	const currency = activeCurrency();
	const pendingRecurrences = recurrences.filter(
		row => row.amount && pendingRecurrenceDates(row, key(projectionStart), key(through), linked).length,
	);
	const futureTransactions = transactions.filter(
		row => row.amount && row.date.slice(0, 10) > key(today) && row.date.slice(0, 10) <= key(through),
	);
	const futurePayments = paymentRows.filter(
		row =>
			!row.data.paidDate &&
			row.data.totalPaid &&
			row.data.dueDate > key(today) &&
			row.data.dueDate <= key(through),
	);
	const futureCardBooks = bookRows.filter(
		row => forecastCardPayments(row.data, key(projectionStart), key(through)).length > 0,
	);
	const forecastCurrencies = [
		...current.filter(row => row.balance).map(row => row.currency ?? "BRL"),
		...pendingRecurrences.flatMap(row => [
			row.currency ?? "BRL",
			...accounts
				.filter(account =>
					[row.originFinancialAccountId, row.destinationFinancialAccountId].includes(account.id),
				)
				.map(account => account.currency ?? "BRL"),
			...cards.filter(card => card.id === row.creditCardId).map(card => card.currency ?? "BRL"),
		]),
		...futureCardBooks.map(row => row.data.card.currency ?? "BRL"),
		...futurePayments.map(row => row.data.currency ?? "BRL"),
		...futureTransactions.flatMap(row => [
			row.bookingCurrency ?? "BRL",
			...accounts
				.filter(account =>
					[row.originFinancialAccountId, row.destinationFinancialAccountId].includes(account.id),
				)
				.map(account => account.currency ?? "BRL"),
		]),
	];
	if (
		pendingRecurrences.some(row => row.movement !== "CARD_PURCHASE") ||
		futureTransactions.length ||
		futurePayments.length ||
		futureCardBooks.length
	)
		forecastCurrencies.push(
			accounts.find(row => row.isPrimary)?.currency ??
				accounts.find(row => row.type === "CHECKING" || row.type === "CASH")?.currency ??
				currency,
		);
	const forecastMoney = await guestDashboardCurrencyContext({
		currency,
		forecastCurrencies,
		forecasting: through > today,
		nativeCurrencies: [],
		positions: [],
		reference: key(today),
	});
	const projectedBooks = await Promise.all(
		cards.map(async card =>
			projectRecurrenceCreditBook(
				await readLocalCreditBook(card.id),
				forecastMoney.consolidation.forecastAvailable
					? recurrences
					: recurrences.filter(row => (row.currency ?? "BRL") === (card.currency ?? "BRL")),
				key(projectionStart),
				key(through),
				occurrences,
				(amount, source, target, date) =>
					(amount * forecastMoney.factor(source, date)) / forecastMoney.factor(target, date),
			),
		),
	);
	const projectedRecurringPayments = new Map(
		projectedBooks.flatMap(book => [...recurringCardPaymentAmounts(book)]),
	);
	const projected: Array<Omit<ForecastMovement, "date"> & { date: Date }> = [];
	for (const recurrence of recurrences) {
		if (
			!recurrence.isActive ||
			recurrenceNeedsConfiguration(recurrence) ||
			recurrence.movement === "CARD_PURCHASE"
		)
			continue;
		for (const date of recurrenceDates(recurrence, key(projectionStart), key(through))) {
			if (!linked.has(`${recurrence.id}:${date}`))
				projected.push({
					amount: recurrence.amount,
					cardPayment: recurrence.movement === "CARD_PAYMENT",
					currency: recurrence.currency ?? "BRL",
					date: new Date(`${date}T12:00:00`),
					destinationAccountId: recurrence.destinationFinancialAccountId,
					originAccountId: recurrence.originFinancialAccountId,
					recurring: true,
					...(recurrence.movement === "CARD_PAYMENT"
						? { recurringAmount: projectedRecurringPayments.get(`forecast:${recurrence.id}:${date}`) ?? 0 }
						: {}),
					type:
						recurrence.movement === "TRANSFER"
							? "TRANSFER"
							: recurrence.movement === "INCOME"
								? "INCOME"
								: "EXPENSE",
				});
		}
	}
	const statements = projectedBooks.flatMap(book =>
		forecastCardPayments(book, key(projectionStart), key(through)),
	);
	for (const statement of statements) {
		const date = new Date(`${statement.dueDate.slice(0, 10)}T12:00:00`);
		if (date >= projectionStart && date <= through && statement.balanceAmount > 0)
			projected.push({
				amount: statement.balanceAmount,
				cardPayment: true,
				currency: cards.find(card => card.id === statement.creditCardId)?.currency ?? "BRL",
				date,
				originAccountId:
					cards.find(card => card.id === statement.creditCardId)?.paymentAccountId ??
					accounts.find(
						account =>
							account.isDefaultForStatements &&
							!account.isHidden &&
							["CHECKING", "CASH", "SAVINGS", "INVESTMENT"].includes(account.type),
					)?.id ??
					accounts.find(
						account => account.isPrimary && !account.isHidden && ["CHECKING", "CASH"].includes(account.type),
					)?.id,
				recurringAmount: statement.recurringAmount,
				type: "EXPENSE",
			});
	}
	for (const { data: payment } of paymentRows) {
		const date = new Date(`${payment.dueDate.slice(0, 10)}T12:00:00`);
		if (!payment.paidDate && date >= projectionStart && date <= through)
			projected.push({
				amount: payment.totalPaid,
				currency: payment.currency ?? "BRL",
				date,
				type: "EXPENSE",
			});
	}
	const rateResult = await refreshReferenceRateAverages();
	const averages: Partial<Record<ReferenceRateType, number>> = {};
	for (const type of ["CDI", "SELIC"] as const)
		if (rateResult?.averages[type] != null) averages[type] = rateResult.averages[type];
	const yieldHolidays = new Set(
		(holidays as FinancialAccountYieldHoliday[] | null)?.map(row => row.date.slice(0, 10)) ?? [],
	);
	const yieldAccounts = new Map(
		accounts.map(account => [
			account.id,
			{ ...account, institutionYieldPolicies: account.institution?.yieldPolicies },
		]),
	);

	const recurringPayments = new Map(bookRows.flatMap(row => [...recurringCardPaymentAmounts(row.data)]));
	const movements: Array<Omit<ForecastMovement, "date"> & { date: Date }> = [
		...loanAccountMovements(paymentRows.map(row => row.data)).map(row => ({
			amount: row.amount,
			currency: row.bookingCurrency,
			date: new Date(`${row.date.slice(0, 10)}T12:00:00`),
			originAccountId: row.originFinancialAccountId,
			type: "EXPENSE" as const,
		})),
		...transactions
			.filter(item => item.type !== "REFUND")
			.map(item => ({
				...item,
				cardPayment: Boolean(item.paymentCreditCardId),
				currency:
					item.bookingCurrency ??
					accounts.find(
						account =>
							account.id ===
							(item.type === "INCOME" ? item.destinationFinancialAccountId : item.originFinancialAccountId),
					)?.currency ??
					"BRL",
				date: new Date(`${item.date.slice(0, 10)}T12:00:00`),
				destinationAccountId: item.destinationFinancialAccountId,
				originAccountId: item.originFinancialAccountId,
				recurring: Boolean(item.recurrenceId),
				recurringAmount: recurringPayments.get(item.id),
				type: item.type as "INCOME" | "EXPENSE" | "TRANSFER",
			})),
		...projected,
		...bookRows
			.flatMap(row => creditBookRewards(row.data))
			.filter(reward =>
				accounts.some(
					account =>
						account.id === reward.cashbackAccountId &&
						account.type !== "CREDIT_CARD" &&
						(account.type !== "REWARDS" || account.rewardsAccount?.kind === "CASHBACK"),
				),
			)
			.map(reward => ({
				amount: reward.cashbackAmount ?? 0,
				currency: accounts.find(account => account.id === reward.cashbackAccountId)?.currency ?? "BRL",
				date: new Date(`${reward.purchaseDate.slice(0, 10)}T12:00:00`),
				destinationAccountId: reward.cashbackAccountId,
				type: "INCOME" as const,
			})),
		...accounts.flatMap(account =>
			calculateFinancialAccountYieldEntries(
				account,
				[...transactions, ...loanAccountMovements(paymentRows.map(row => row.data))],
				[...yieldHolidays],
				today,
				(yields as FinancialAccountYield[] | null) ?? [],
			).map(entry => ({
				amount: entry.amount,
				currency: account.currency ?? "BRL",
				date: new Date(`${entry.date}T12:00:00`),
				destinationAccountId: account.id,
				type: "INCOME" as const,
			})),
		),
	];
	const positionDates = [
		...new Set([
			key(today),
			key(start),
			key(end),
			...periods.flatMap(row => [key(addDays(row.start, -1)), key(row.end)]),
			...movements.map(row => key(row.date)),
		]),
	];
	const currencies = [
		...current.filter(row => row.balance).map(row => row.currency ?? "BRL"),
		...cards.filter(row => row.creditLimit).map(row => row.currency ?? "BRL"),
		...movements.filter(row => row.amount && key(row.date) === key(today)).map(row => row.currency ?? "BRL"),
	];
	const money = await guestDashboardCurrencyContext({
		currency,
		forecastCurrencies,
		forecasting: through > today,
		forecastSnapshot: forecastMoney.forecastSnapshot,
		nativeCurrencies: currencies,
		positions: positionDates
			.flatMap(date =>
				historicalAccountsAt(new Date(`${date}T12:00:00`))
					.filter(account => account.balance)
					.map(account => ({ currency: account.currency ?? "BRL", date })),
			)
			.concat(
				movements
					.filter(row => row.amount)
					.map(row => ({ currency: row.currency ?? "BRL", date: key(row.date) })),
			),
		reference: key(today),
	});
	const forecastDays = !money.consolidation.forecastAvailable
		? []
		: dailyForecast({
				accounts: current.map(account => ({
					...account,
					balance: account.balance ?? 0,
					type:
						account.type === "REWARDS" && account.rewardsAccount?.kind === "CASHBACK"
							? "CASHBACK"
							: account.type,
				})),
				currency,
				from: key(projectionStart),
				movements: movements
					.filter(item => key(item.date) > key(today))
					.map(item => ({ ...item, date: key(item.date) })),
				netYield: (account, balance, day) => {
					const settings = yieldAccounts.get(account.id);
					return settings ? projectedNetYield(settings, balance, day, averages, yieldHolidays) : 0;
				},
				primaryAccountId: accounts.find(account => account.isPrimary)?.id,
				rate: money.factor,
				through: key(through),
			});
	for (const day of forecastDays) {
		const originalIncome = movements
			.filter(movement => key(movement.date) === day.date && movement.type === "INCOME")
			.reduce(
				(sum, movement) => sum + money.convert(movement.amount, movement.currency ?? "BRL", day.date),
				0,
			);
		const yieldedIncome = day.income - originalIncome;
		if (yieldedIncome > 0)
			movements.push({
				amount: yieldedIncome,
				currency,
				date: new Date(`${day.date}T12:00:00`),
				type: "INCOME",
			});
	}
	const projectedByDate = new Map(forecastDays.map(day => [day.date, day]));
	const balancesAt = (date: Date) =>
		projectedByDate.get(key(date))?.balances ??
		new Map(historicalAccountsAt(date).map(account => [account.id, account.balance ?? 0]));
	const balanceAt = (date: Date) => {
		if (key(date) > key(today) && !money.consolidation.forecastAvailable)
			throw new GuestConversionUnavailable(currency, key(date), money.consolidation);
		const forecast = projectedByDate.get(key(date));
		const breakdown =
			forecast ??
			forecastBreakdown(
				current.map(account => ({
					...account,
					balance: account.balance ?? 0,
					type:
						account.type === "REWARDS" && account.rewardsAccount?.kind === "CASHBACK"
							? "CASHBACK"
							: account.type,
				})),
				balancesAt(date),
				0,
				{ currency, rate: source => money.factor(source, key(date)) },
			);
		return {
			accountBalance: breakdown.accountBalance,
			endingBalance: breakdown.totalBalance,
			fixedIncomeBalance: breakdown.fixedIncomeBalance,
			savingsBalance: breakdown.savingsBalance,
			variableIncomeBalance: breakdown.variableIncomeBalance,
		};
	};
	const consolidatedMovements = movements
		.filter(row => money.consolidation.forecastAvailable || key(row.date) <= key(today))
		.map(row => ({
			...row,
			amount: money.convert(row.amount, row.currency ?? "BRL", key(row.date)),
			currency,
			recurringAmount:
				row.recurringAmount == null
					? undefined
					: money.convert(row.recurringAmount, row.currency ?? "BRL", key(row.date)),
		}));
	const buildPeriods = () =>
		periods.map(({ start, end }) => {
			const rows = consolidatedMovements.filter(item => item.date >= start && item.date <= end);
			const income = rows.filter(item => item.type === "INCOME").reduce((sum, item) => sum + item.amount, 0);
			const expenses = rows
				.filter(item => item.type === "EXPENSE")
				.reduce((sum, item) => sum + item.amount, 0);
			return {
				...balanceAt(end),
				cardExpenses: rows
					.filter(item => item.type === "EXPENSE" && item.cardPayment)
					.reduce((sum, item) => sum + item.amount, 0),
				endDate: key(end),
				expenses,
				income,
				initialBalance: balanceAt(addDays(start, -1)).endingBalance,
				net: income - expenses,
				recurringCardExpenses: rows
					.filter(item => item.type === "EXPENSE" && item.cardPayment)
					.reduce((sum, item) => sum + (item.recurringAmount ?? (item.recurring ? item.amount : 0)), 0),
				recurringExpenses: rows
					.filter(item => item.type === "EXPENSE")
					.reduce((sum, item) => sum + (item.recurringAmount ?? (item.recurring ? item.amount : 0)), 0),
				recurringIncome: rows
					.filter(item => item.type === "INCOME")
					.reduce((sum, item) => sum + (item.recurringAmount ?? (item.recurring ? item.amount : 0)), 0),
				startDate: key(start),
			};
		});
	return {
		balanceAt,
		balancesAt,
		consolidation: money.consolidation,
		currency,
		money,
		movements: consolidatedMovements,
		get periods() {
			return buildPeriods();
		},
		projectedStatements: statements,
		referenceRatesAvailable: rateResult?.ready ?? false,
	};
}
export async function getGuestDashboardComparison(
	parameters: DashboardComparisonParameters,
): Promise<DashboardPeriod[]> {
	return (await getGuestDashboardFinancialContext(parameters)).periods;
}
