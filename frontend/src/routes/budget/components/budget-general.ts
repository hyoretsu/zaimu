import {
	budgetParent,
	isMonthlyAdjustment,
	type MonthlyBudget,
	monthlyBudgetSummary,
} from "@zaimu/finance/monthly-budget";
import { type RecurrenceDefinition, recurrenceNeedsConfiguration } from "@zaimu/finance/recurrence";

export async function generalBudgetAvailability(input: {
	recurrences: readonly RecurrenceDefinition[];
	budgets: readonly MonthlyBudget[];
	today: string;
	currency: string;
	rate: (date: string, from: string, to: string) => Promise<number>;
}) {
	const convert = async (amount: number, currency: string) =>
		amount * (currency === input.currency ? 1 : await input.rate(input.today, currency, input.currency));
	const income = (
		await Promise.all(
			input.recurrences
				.filter(
					row =>
						row.isActive &&
						row.movement === "INCOME" &&
						!recurrenceNeedsConfiguration(row) &&
						row.startDate <= input.today &&
						(!row.endDate || row.endDate >= input.today),
				)
				.map(row => {
					const monthlyOccurrences = { DAY: 365.2425 / 12, MONTH: 1, WEEK: 365.2425 / 84, YEAR: 1 / 12 };
					return convert((row.amount * monthlyOccurrences[row.unit]) / row.interval, row.currency ?? "BRL");
				}),
		)
	).reduce((sum, amount) => sum + amount, 0);
	const month = input.today.slice(0, 7);
	const active = input.budgets.filter(row => !isMonthlyAdjustment(row));
	const summary = monthlyBudgetSummary({ budgets: active, commitments: [], month }).items;
	const expenses = (
		await Promise.all(
			summary
				.filter(row => !budgetParent(row, summary, active))
				.map(row => convert(row.projectedAmount, row.currency)),
		)
	).reduce((sum, amount) => sum + amount, 0);
	return { expenses, income, net: income - expenses };
}
