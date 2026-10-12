import { currencyScale, roundMoney, toMinorUnits } from "./money";

export interface MonthlyBudget {
	id: string;
	name: string;
	source: "TAG" | "STATEMENTS" | "CUSTOM";
	categoryId: string | null;
	amount: number;
	currency: string;
	startMonth: string;
	endMonth: string | null;
}
/** Single-month records override the recurring plan with the same origin and currency.
 * Independent reserves use their name as their planning identity. */
export function sameBudgetPlan(
	a: Pick<MonthlyBudget, "source" | "categoryId" | "currency" | "name">,
	b: Pick<MonthlyBudget, "source" | "categoryId" | "currency" | "name">,
) {
	return (
		a.source === b.source &&
		a.categoryId === b.categoryId &&
		a.currency === b.currency &&
		(a.source !== "CUSTOM" || a.name === b.name)
	);
}
export function isMonthlyAdjustment(a: Pick<MonthlyBudget, "startMonth" | "endMonth">) {
	return a.startMonth === a.endMonth;
}
export interface BudgetCommitment {
	id?: string;
	amount: number;
	currency: string;
	date: string;
	tagIds?: readonly string[];
	cardPayment?: boolean;
	type: string;
}
export interface MonthlyBudgetItem extends MonthlyBudget {
	plannedAmount: number;
	knownAmount: number;
	additionalAmount: number;
	projectedAmount: number;
}
export interface MonthlyBudgetSummary {
	month: string;
	items: MonthlyBudgetItem[];
}
/** Payments and outstanding invoices consume the same aggregate envelope. Card purchases
 * are not cash movements and must not be included again as tagged commitments. */
export function monthlyBudgetSummary(input: {
	budgets: readonly MonthlyBudget[];
	commitments: readonly BudgetCommitment[];
	month: string;
	convert?: (amount: number, source: string, target: string, date: string) => number;
}): MonthlyBudgetSummary {
	monthEnd(input.month);
	const commitments = input.commitments.filter(
		row => row.date.slice(0, 7) === input.month && row.type === "EXPENSE",
	);
	const active = input.budgets.filter(
		row => row.startMonth <= input.month && (!row.endMonth || row.endMonth >= input.month),
	);
	const budgets = active.filter(
		row =>
			isMonthlyAdjustment(row) ||
			!active.some(other => isMonthlyAdjustment(other) && sameBudgetPlan(row, other)),
	);
	const matchesBudget = (budget: MonthlyBudget, row: BudgetCommitment) =>
		budget.source === "STATEMENTS"
			? row.cardPayment
			: budget.source === "TAG" && !row.cardPayment && row.tagIds?.includes(budget.categoryId ?? "");
	return {
		items: budgets.map(budget => {
			const seen = new Set<string>();
			let knownAmount = 0;
			for (const row of commitments) {
				const matches = matchesBudget(budget, row);
				if (!matches || (row.id && seen.has(row.id))) continue;
				if (row.id) seen.add(row.id);
				if (row.currency !== budget.currency && !input.convert)
					throw new Error("Budget consolidation requires currency conversion");
				const matching = budgets
					.filter(other => matchesBudget(other, row))
					.sort((a, b) => a.id.localeCompare(b.id));
				const cents = toMinorUnits(row.amount, row.currency);
				const share = Math.floor(cents / matching.length);
				const amount =
					(share +
						(matching.findIndex(other => other.id === budget.id) < cents % matching.length
							? 1
							: 0)) /
					currencyScale(row.currency);
				knownAmount +=
					row.currency === budget.currency
						? amount
						: input.convert!(amount, row.currency, budget.currency, row.date);
			}
			knownAmount = roundMoney(knownAmount, budget.currency);
			const plannedAmount = roundMoney(budget.amount, budget.currency);
			const additionalAmount = roundMoney(Math.max(0, plannedAmount - knownAmount), budget.currency);
			return {
				...budget,
				additionalAmount,
				knownAmount,
				plannedAmount,
				projectedAmount: roundMoney(knownAmount + additionalAmount, budget.currency),
			};
		}),
		month: input.month,
	};
}
export function monthlyBudgetMovements(input: {
	budgets: readonly MonthlyBudget[];
	commitments: readonly BudgetCommitment[];
	from: string;
	through: string;
	convert?: (amount: number, source: string, target: string, date: string) => number;
}) {
	const result: Array<BudgetCommitment & { budgetId: string }> = [];
	for (let month = input.from.slice(0, 7); month <= input.through.slice(0, 7); month = nextMonth(month)) {
		const date = monthEnd(month);
		if (date < input.from || date > input.through) continue;
		for (const row of monthlyBudgetSummary({ ...input, month }).items)
			if (row.additionalAmount > 0)
				result.push({
					amount: row.additionalAmount,
					budgetId: row.id,
					cardPayment: row.source === "STATEMENTS",
					currency: row.currency,
					date,
					id: `budget:${row.id}:${month}`,
					type: "EXPENSE",
				});
	}
	return result;
}
export function monthEnd(month: string) {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid budget month");
	const [year, number] = month.split("-").map(Number);
	return new Date(Date.UTC(year!, number!, 0, 12)).toISOString().slice(0, 10);
}
function nextMonth(month: string) {
	const date = new Date(`${month}-01T12:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + 1);
	return date.toISOString().slice(0, 7);
}
