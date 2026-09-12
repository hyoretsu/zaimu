import { addDays, addMonths, addWeeks, addYears, endOfDay, format, isAfter, startOfDay } from "date-fns";

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
	expenses: number;
	income: number;
	initialBalance: number;
	net: number;
	startDate: string;
}

export function dateKey(value: Date) {
	return format(value, "yyyy-MM-dd");
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
	return Array.from({ length: 13 }, (_, index) => {
		const offset = index - 6;
		const start = addDays(input.base.start, offset * duration);
		const end = endOfDay(addDays(start, duration - 1));
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

export function period(input: {
	end: Date;
	expenses: number;
	income: number;
	initialBalance: number;
	start: Date;
}): DashboardPeriod {
	return {
		endDate: dateKey(input.end),
		expenses: input.expenses,
		income: input.income,
		initialBalance: input.initialBalance,
		net: input.income - input.expenses,
		startDate: dateKey(input.start),
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
