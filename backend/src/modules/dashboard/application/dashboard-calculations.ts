import {
	addDays,
	addMonths,
	addWeeks,
	addYears,
	endOfDay,
	endOfMonth,
	format,
	isAfter,
	isSameDay,
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
	endDate: string;
	endingBalance: number;
	expenses: number;
	income: number;
	initialBalance: number;
	net: number;
	startDate: string;
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

export function resolveDashboardRange(startDate?: string, endDate?: string, today = new Date()) {
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
	const from = startOfDay(input.from ?? new Date());
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

export function buildComparisonPeriods(input: {
	base: { end: Date; start: Date };
	initialBalance: number;
	transactions: Array<{ amount: number; date: Date; type: "EXPENSE" | "INCOME" | "TRANSFER" }>;
}) {
	const duration =
		Math.round((startOfDay(input.base.end).getTime() - startOfDay(input.base.start).getTime()) / 86_400_000) +
		1;
	const calendarMonths = completeCalendarMonths(input.base);
	return Array.from({ length: 13 }, (_, index) => {
		const offset = index - 6;
		const start = calendarMonths
			? startOfDay(addMonths(input.base.start, offset * calendarMonths))
			: addDays(input.base.start, offset * duration);
		const end = calendarMonths
			? endOfDay(endOfMonth(addMonths(start, calendarMonths - 1)))
			: endOfDay(addDays(start, duration - 1));
		const movements = input.transactions.filter(
			item => item.date >= start && item.date <= end && item.type !== "TRANSFER",
		);
		const income = movements
			.filter(item => item.type === "INCOME")
			.reduce((sum, item) => sum + item.amount, 0);
		const expenses = movements
			.filter(item => item.type === "EXPENSE")
			.reduce((sum, item) => sum + item.amount, 0);
		const before = input.transactions
			.filter(item => item.date < start && item.type !== "TRANSFER")
			.reduce((sum, item) => sum + (item.type === "INCOME" ? item.amount : -item.amount), 0);
		return {
			...period({ end, expenses, income, initialBalance: input.initialBalance + before, start }),
		};
	});
}

export function comparisonRangeEnd(base: { end: Date; start: Date }) {
	const calendarMonths = completeCalendarMonths(base);
	if (calendarMonths) return endOfDay(endOfMonth(addMonths(base.start, calendarMonths * 6)));
	const duration =
		Math.round((startOfDay(base.end).getTime() - startOfDay(base.start).getTime()) / 86_400_000) + 1;
	return endOfDay(addDays(base.end, duration * 6));
}

export function period(input: {
	end: Date;
	expenses: number;
	income: number;
	initialBalance: number;
	start: Date;
}): DashboardPeriod {
	return {
		endDate: dateKey(input.end),
		endingBalance: input.initialBalance + input.income - input.expenses,
		expenses: input.expenses,
		income: input.income,
		initialBalance: input.initialBalance,
		net: input.income - input.expenses,
		startDate: dateKey(input.start),
	};
}

export function endingBalanceAtPeriodEnd(input: {
	currentBalance: number;
	periodEnd: Date;
	today: Date;
	transactions: Array<{ amount: number; date: Date; type: "EXPENSE" | "INCOME" | "TRANSFER" }>;
}) {
	const today = startOfDay(input.today);
	const periodEnd = startOfDay(input.periodEnd);
	const movements = input.transactions.filter(transaction => transaction.type !== "TRANSFER");
	const net = (transactions: typeof movements) =>
		transactions.reduce(
			(sum, transaction) => sum + (transaction.type === "INCOME" ? transaction.amount : -transaction.amount),
			0,
		);

	if (periodEnd < today)
		return (
			input.currentBalance -
			net(
				movements.filter(transaction => transaction.date > endOfDay(periodEnd) && transaction.date <= today),
			)
		);
	if (periodEnd > today)
		return (
			input.currentBalance +
			net(movements.filter(transaction => transaction.date > today && transaction.date <= periodEnd))
		);
	return input.currentBalance;
}

function monthlyDate(reference: Date, day: number) {
	const lastDay = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
	return new Date(reference.getFullYear(), reference.getMonth(), Math.min(day, lastDay));
}

function yearlyDate(reference: Date, day: number) {
	const lastDay = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
	return new Date(reference.getFullYear(), reference.getMonth(), Math.min(day, lastDay));
}

function completeCalendarMonths(base: { end: Date; start: Date }) {
	const start = startOfDay(base.start);
	const end = startOfDay(base.end);
	if (start.getDate() !== 1 || !isSameDay(end, endOfMonth(end))) return undefined;
	return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}
