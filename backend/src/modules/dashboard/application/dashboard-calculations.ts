import { comparisonIntervals, type ComparisonOptions } from "@zaimu/finance/comparison-periods";
import { businessNow } from "@zaimu/finance/time-zone";
import {
	addDays,
	addMonths,
	addWeeks,
	addYears,
	endOfDay,
	endOfMonth,
	format,
	isAfter,
	startOfDay,
} from "date-fns";

export type ForecastDirection = "INCOME" | "EXPENSE";
export type ForecastType = "CARD" | "LOAN" | "RECURRING" | "SALARY" | "SUBSCRIPTION" | "TRANSACTION";
export type RecurrenceFrequency = "BIWEEKLY" | "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY";

export interface DashboardForecast {
	amount: number;
	date: string;
	direction: ForecastDirection;
	id: string;
	name: string;
	sourceId: string;
	type: ForecastType;
}

export interface DashboardPeriod {
	cardExpenses: number;
	recurringCardExpenses: number;
	endDate: string;
	endingBalance: number;
	expenses: number;
	recurringExpenses: number;
	recurringIncome: number;
	income: number;
	initialBalance: number;
	net: number;
	startDate: string;
}

interface SummarizableMovement {
	amount: number;
	cardPayment?: boolean;
	recurring?: boolean;
	recurringAmount?: number;
	type: "EXPENSE" | "INCOME" | "TRANSFER";
}

/** Single-pass totals over movements; each accumulator adds in input order like the equivalent filter+reduce. */
export function summarizeMovements(movements: readonly SummarizableMovement[]) {
	const totals = {
		cardExpenses: 0,
		expenses: 0,
		income: 0,
		recurringCardExpenses: 0,
		recurringExpenses: 0,
		recurringIncome: 0,
	};
	for (const item of movements) {
		const recurringAmount = item.recurringAmount ?? (item.recurring ? item.amount : 0);
		if (item.type === "INCOME") {
			totals.income += item.amount;
			totals.recurringIncome += recurringAmount;
		} else if (item.type === "EXPENSE") {
			totals.expenses += item.amount;
			totals.recurringExpenses += recurringAmount;
			if (item.cardPayment) {
				totals.cardExpenses += item.amount;
				totals.recurringCardExpenses += recurringAmount;
			}
		}
	}
	return totals;
}

export function dateKey(value: Date) {
	return format(value, "yyyy-MM-dd");
}

export function databaseDate(value: Date) {
	return new Date(`${value.toISOString().slice(0, 10)}T12:00:00`);
}

export function reconcilePeriodCashFlow(input: {
	endingBalance: number;
	expenses: number;
	income: number;
	initialBalance: number;
}) {
	const uncategorizedChange = input.endingBalance - input.initialBalance - (input.income - input.expenses);
	return {
		expenses: input.expenses + Math.max(0, -uncategorizedChange),
		income: input.income + Math.max(0, uncategorizedChange),
	};
}

export function resolveDashboardRange(startDate?: string, endDate?: string, today = businessNow()) {
	const fallbackStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
	const fallbackEnd = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));
	const start = startDate ? startOfDay(new Date(`${startDate}T00:00:00`)) : fallbackStart;
	const end = endDate ? endOfDay(new Date(`${endDate}T00:00:00`)) : fallbackEnd;
	return start <= end ? { end, start } : { end: start, start: end };
}

export function nextOccurrence(input: {
	dayOfMonth?: null | number;
	dayOfWeek?: null | number;
	endDate?: Date | null;
	frequency: RecurrenceFrequency;
	from?: Date;
	startDate: Date;
}) {
	const from = startOfDay(input.from ?? businessNow());
	const start = startOfDay(input.startDate);
	const end = input.endDate ? endOfDay(input.endDate) : undefined;
	if (end && end < from) return undefined;

	let occurrence = start;
	if (input.frequency === "MONTHLY") occurrence = monthlyDate(start, input.dayOfMonth ?? start.getDate());
	if (input.frequency === "YEARLY") occurrence = yearlyDate(start, input.dayOfMonth ?? start.getDate());
	if (
		(input.frequency === "WEEKLY" || input.frequency === "BIWEEKLY") &&
		typeof input.dayOfWeek === "number"
	) {
		occurrence = addDays(start, (input.dayOfWeek - start.getDay() + 7) % 7);
	}
	while (occurrence < from) {
		switch (input.frequency) {
			case "DAILY":
				occurrence = addDays(occurrence, 1);
				break;
			case "WEEKLY":
				occurrence = addWeeks(occurrence, 1);
				break;
			case "BIWEEKLY":
				occurrence = addWeeks(occurrence, 2);
				break;
			case "MONTHLY":
				occurrence = monthlyDate(addMonths(occurrence, 1), input.dayOfMonth ?? start.getDate());
				break;
			case "YEARLY":
				occurrence = yearlyDate(addYears(occurrence, 1), input.dayOfMonth ?? start.getDate());
				break;
		}
	}
	return end && isAfter(occurrence, end) ? undefined : occurrence;
}

export function occurrencesInRange(input: {
	dayOfMonth?: null | number;
	dayOfWeek?: null | number;
	endDate?: Date | null;
	frequency: RecurrenceFrequency;
	from: Date;
	startDate: Date;
	through: Date;
}) {
	const occurrences: Date[] = [];
	let occurrence = nextOccurrence(input);
	while (occurrence && occurrence <= endOfDay(input.through)) {
		occurrences.push(occurrence);
		occurrence = nextOccurrence({ ...input, from: addDays(occurrence, 1) });
	}
	return occurrences;
}

export function buildComparisonPeriods(
	input: ComparisonOptions & {
		base: { end: Date; start: Date };
		initialBalance: number;
		transactions: Array<{
			amount: number;
			date: Date;
			cardPayment?: boolean;
			recurring?: boolean;
			recurringAmount?: number;
			type: "EXPENSE" | "INCOME" | "TRANSFER";
		}>;
	},
) {
	return comparisonIntervals(input.base.start, input).map(({ start, end }) => {
		const movements = input.transactions.filter(
			item => item.date >= start && item.date <= end && item.type !== "TRANSFER",
		);
		const totals = summarizeMovements(movements);
		return {
			...period({
				end,
				expenses: totals.expenses,
				income: totals.income,
				initialBalance: balanceAtPeriodStart(input, start),
				start,
			}),
			cardExpenses: totals.cardExpenses,
			recurringCardExpenses: totals.recurringCardExpenses,
			recurringExpenses: totals.recurringExpenses,
			recurringIncome: totals.recurringIncome,
		};
	});
}

export function comparisonRangeEnd(base: { end: Date; start: Date }, options: ComparisonOptions = {}) {
	return comparisonIntervals(base.start, options).at(-1)!.end;
}

function balanceAtPeriodStart(input: Parameters<typeof buildComparisonPeriods>[0], periodStart: Date) {
	const referenceStart = startOfDay(input.base.start);
	const net = (from: Date, to: Date) =>
		input.transactions
			.filter(item => item.date >= from && item.date < to && item.type !== "TRANSFER")
			.reduce((sum, item) => sum + (item.type === "INCOME" ? item.amount : -item.amount), 0);
	return periodStart < referenceStart
		? input.initialBalance - net(periodStart, referenceStart)
		: input.initialBalance + net(referenceStart, periodStart);
}

export function period(input: {
	end: Date;
	expenses: number;
	income: number;
	initialBalance: number;
	start: Date;
}): DashboardPeriod {
	return {
		cardExpenses: 0,
		endDate: dateKey(input.end),
		endingBalance: input.initialBalance + input.income - input.expenses,
		expenses: input.expenses,
		income: input.income,
		initialBalance: input.initialBalance,
		net: input.income - input.expenses,
		recurringCardExpenses: 0,
		recurringExpenses: 0,
		recurringIncome: 0,
		startDate: dateKey(input.start),
	};
}

export function endingBalanceAtPeriodEnd(input: {
	currentBalance: number;
	periodEnd: Date;
	today: Date;
	transactions: Array<{
		amount: number;
		date: Date;
		recurring?: boolean;
		recurringAmount?: number;
		type: "EXPENSE" | "INCOME" | "TRANSFER";
	}>;
}) {
	const today = startOfDay(input.today);
	const periodEnd = startOfDay(input.periodEnd);
	const movements = input.transactions.filter(transaction => transaction.type !== "TRANSFER");
	const net = (transactions: typeof movements) =>
		transactions.reduce(
			(sum, transaction) =>
				sum + (transaction.type === "INCOME" ? transaction.amount : -transaction.amount),
			0,
		);

	if (periodEnd < today)
		return (
			input.currentBalance -
			net(
				movements.filter(
					transaction => transaction.date > endOfDay(periodEnd) && transaction.date <= today,
				),
			)
		);
	if (periodEnd > today)
		return (
			input.currentBalance +
			net(movements.filter(transaction => transaction.date > today && transaction.date <= periodEnd))
		);
	return input.currentBalance;
}

export function projectedCashFlowUntilMonthEnd(input: {
	today: Date;
	transactions: Array<{
		amount: number;
		date: Date;
		recurring?: boolean;
		recurringAmount?: number;
		type: "EXPENSE" | "INCOME" | "TRANSFER";
	}>;
}) {
	const today = startOfDay(input.today);
	const monthEnd = endOfMonth(today);
	const movements = input.transactions.filter(
		transaction => transaction.date > endOfDay(today) && transaction.date <= monthEnd,
	);
	const totals = summarizeMovements(movements);
	return {
		expenses: totals.expenses,
		income: totals.income,
		net: totals.income - totals.expenses,
		recurringExpenses: totals.recurringExpenses,
		recurringIncome: totals.recurringIncome,
	};
}

function monthlyDate(reference: Date, day: number) {
	const lastDay = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
	return new Date(reference.getFullYear(), reference.getMonth(), Math.min(day, lastDay));
}

function yearlyDate(reference: Date, day: number) {
	const lastDay = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
	return new Date(reference.getFullYear(), reference.getMonth(), Math.min(day, lastDay));
}
