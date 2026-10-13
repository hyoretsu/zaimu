import { currencyScale, roundMoney, toMinorUnits } from "./money";

export interface MonthlyBudget {
	id: string;
	name: string;
	source: "TAG" | "STATEMENTS" | "CUSTOM";
	categoryId: string | null;
	parentBudgetId?: string | null;
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
	const items = budgets.map(budget => {
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
					(matching.findIndex(other => other.id === budget.id) < cents % matching.length ? 1 : 0)) /
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
	});
	return { items: consolidateBudgetHierarchy(items, input.budgets), month: input.month };
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
		const items = monthlyBudgetSummary({ ...input, month }).items;
		for (const row of items)
			if (!budgetParent(row, items, input.budgets) && row.additionalAmount > 0)
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

/** Resolve monthly overrides before following the parent link. Inactive parents leave children independent. */
export function budgetParent<T extends MonthlyBudget>(
	row: MonthlyBudget,
	active: readonly T[],
	all: readonly MonthlyBudget[] = active,
): T | undefined {
	const original = all.find(candidate => candidate.id === row.parentBudgetId);
	return original
		? (active.find(candidate => candidate.id === original.id) ??
				active.find(candidate => sameBudgetPlan(candidate, original)))
		: undefined;
}
export function consolidateBudgetHierarchy(
	items: MonthlyBudgetItem[],
	all: readonly MonthlyBudget[] = items,
) {
	const visiting = new Set<string>();
	const done = new Set<string>();
	const visit = (row: MonthlyBudgetItem) => {
		if (done.has(row.id)) return;
		if (visiting.has(row.id)) throw new Error("Categorias de orçamento não podem formar um ciclo.");
		visiting.add(row.id);
		const children = items.filter(child => budgetParent(child, items, all)?.id === row.id);
		for (const child of children) visit(child);
		const known = children.reduce((sum, child) => sum + child.knownAmount, 0);
		const projected = children.reduce((sum, child) => sum + child.projectedAmount, 0);
		row.knownAmount = roundMoney(row.knownAmount + known, row.currency);
		row.projectedAmount = roundMoney(
			Math.max(row.plannedAmount, row.knownAmount, projected),
			row.currency,
		);
		row.additionalAmount = roundMoney(Math.max(0, row.projectedAmount - row.knownAmount), row.currency);
		visiting.delete(row.id);
		done.add(row.id);
	};
	for (const row of items) visit(row);
	return items;
}
export function validateBudgetHierarchy(
	budgets: readonly MonthlyBudget[],
	input: Omit<MonthlyBudget, "id">,
	id?: string,
) {
	const next = [...budgets.filter(row => row.id !== id), { ...input, id: id ?? "new-budget" }];
	for (const row of next) {
		if (!row.parentBudgetId) continue;
		const parent = next.find(candidate => candidate.id === row.parentBudgetId);
		if (!parent) throw new Error("Orçamento principal não encontrado.");
		if (isMonthlyAdjustment(parent)) throw new Error("Selecione um orçamento padrão como principal.");
		if (parent.currency !== row.currency)
			throw new Error("Subcategoria deve usar a moeda do orçamento principal.");
		if (
			parent.startMonth > row.startMonth ||
			(parent.endMonth && (!row.endMonth || parent.endMonth < row.endMonth))
		)
			throw new Error("Vigência da subcategoria deve estar dentro da vigência do orçamento principal.");
		const seen = new Set([row.id]);
		let ancestor: MonthlyBudget | undefined = parent;
		while (ancestor) {
			if (seen.has(ancestor.id)) throw new Error("Categorias de orçamento não podem formar um ciclo.");
			seen.add(ancestor.id);
			ancestor = next.find(candidate => candidate.id === ancestor?.parentBudgetId);
		}
	}
}
