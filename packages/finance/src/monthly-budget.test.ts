import { expect, test } from "bun:test";
import { dailyForecast } from "./daily-forecast";
import {
	hasBudgetConflict,
	type MonthlyBudget,
	monthlyBudgetMovements,
	monthlyBudgetSummary,
	sameBudgetPlan,
	validateBudgetHierarchy,
} from "./monthly-budget";

const invoice: MonthlyBudget = {
	amount: 8500,
	categoryId: null,
	currency: "BRL",
	endMonth: null,
	id: "invoice",
	name: "Faturas",
	source: "STATEMENTS",
	startMonth: "2026-01",
};
const expense = (id: string, amount: number, date = "2026-10-10") => ({
	amount,
	cardPayment: true,
	currency: "BRL",
	date,
	id,
	type: "EXPENSE",
});

test("invoice envelope adds only the gap after actual payments and outstanding commitments", () => {
	const commitments = [expense("paid", 2000), expense("outstanding", 4000, "2026-10-20")];
	const summary = monthlyBudgetSummary({ budgets: [invoice], commitments, month: "2026-10" });
	expect(summary.items[0]).toMatchObject({
		additionalAmount: 2500,
		knownAmount: 6000,
		projectedAmount: 8500,
	});
	const remaining = monthlyBudgetMovements({
		budgets: [invoice],
		commitments,
		from: "2026-10-12",
		through: "2026-10-31",
	});
	expect(remaining[0]).toMatchObject({ amount: 2500, cardPayment: true, date: "2026-10-31" });
	const forecast = dailyForecast({
		accounts: [{ balance: 10000, currency: "BRL", id: "cash", type: "CHECKING" }],
		from: "2026-10-12",
		movements: [expense("outstanding", 4000, "2026-10-20"), ...remaining].map(row => ({
			...row,
			type: "EXPENSE",
		})),
		through: "2026-10-31",
	});
	expect(forecast.at(-1)?.totalBalance).toBe(3500);
});
test("overspending wins and duplicate commitments do not inflate known spending", () => {
	const row = expense("payment", 9000);
	expect(
		monthlyBudgetSummary({ budgets: [invoice], commitments: [row, row], month: "2026-10" }).items[0],
	).toMatchObject({ additionalAmount: 0, knownAmount: 9000, projectedAmount: 9000 });
});
test("tag expenses exclude card payments and transfers; custom envelope has no automatic matching", () => {
	const tag: MonthlyBudget = { ...invoice, amount: 1000, categoryId: "bills", id: "tag", source: "TAG" };
	const rows = [
		{ ...expense("rent", 600), cardPayment: false, tagIds: ["bills"] },
		{ ...expense("card", 400), tagIds: ["bills"] },
		{ ...expense("transfer", 300), cardPayment: false, tagIds: ["bills"], type: "TRANSFER" },
	];
	const summary = monthlyBudgetSummary({
		budgets: [tag, invoice, { ...tag, id: "custom", source: "CUSTOM" }],
		commitments: rows,
		month: "2026-10",
	});
	expect(summary.items.map(row => row.knownAmount)).toEqual([600, 400, 0]);
});
test("months respect activation and never charge budget before month end or closed months", () => {
	const budget = { ...invoice, endMonth: "2026-03", startMonth: "2026-02" };
	expect(
		monthlyBudgetMovements({
			budgets: [budget],
			commitments: [],
			from: "2026-01-01",
			through: "2026-04-30",
		}).map(row => row.date),
	).toEqual(["2026-02-28", "2026-03-31"]);
	expect(
		monthlyBudgetMovements({
			budgets: [budget],
			commitments: [],
			from: "2026-02-01",
			through: "2026-02-27",
		}),
	).toEqual([]);
});
test("foreign known expenses use dated conversion into native budget currency", () => {
	const dates: string[] = [];
	const summary = monthlyBudgetSummary({
		budgets: [invoice],
		commitments: [{ ...expense("foreign", 1000), currency: "USD" }],
		convert: (amount, _source, _target, date) => {
			dates.push(date);
			return amount * 5;
		},
		month: "2026-10",
	});
	expect(summary.items[0]?.additionalAmount).toBe(3500);
	expect(dates).toEqual(["2026-10-10"]);
	expect(() =>
		monthlyBudgetSummary({
			budgets: [invoice],
			commitments: [{ ...expense("foreign", 1000), currency: "USD" }],
			month: "2026-10",
		}),
	).toThrow();
});

test("expenses shared by planned tags consume cash only once, preserving cents", () => {
	const a: MonthlyBudget = { ...invoice, amount: 1000, categoryId: "a", id: "a", source: "TAG" };
	const b: MonthlyBudget = { ...a, categoryId: "b", id: "b" };
	const commitments = [{ ...expense("shared", 600.01), cardPayment: false, tagIds: ["a", "b"] }];
	const summary = monthlyBudgetSummary({ budgets: [b, a], commitments, month: "2026-10" });
	expect(summary.items.map(row => row.knownAmount)).toEqual([300, 300.01]);
	expect(summary.items.reduce((total, row) => total + row.knownAmount + row.additionalAmount, 0)).toBe(
		2000,
	);
	const movements = monthlyBudgetMovements({
		budgets: [a, b],
		commitments,
		from: "2026-10-11",
		through: "2026-10-31",
	});
	expect(Math.round((600.01 + movements.reduce((total, row) => total + row.amount, 0)) * 100)).toBe(200000);
});

test("monthly adjustment replaces default only in its month and preserves commitment floor", () => {
	const adjustment = {
		...invoice,
		amount: 7000,
		endMonth: "2026-10",
		id: "october",
		startMonth: "2026-10",
	};
	const budgets = [invoice, adjustment];
	const summary = monthlyBudgetSummary({
		budgets,
		commitments: [expense("known", 6000)],
		month: "2026-10",
	});
	expect(summary.items).toHaveLength(1);
	expect(summary.items[0]).toMatchObject({
		additionalAmount: 1000,
		id: "october",
		plannedAmount: 7000,
		projectedAmount: 7000,
	});
	expect(
		monthlyBudgetSummary({ budgets, commitments: [expense("over", 9000)], month: "2026-10" }).items[0]
			?.projectedAmount,
	).toBe(9000);
	expect(monthlyBudgetSummary({ budgets, commitments: [], month: "2026-09" }).items[0]?.plannedAmount).toBe(
		8500,
	);
	expect(monthlyBudgetSummary({ budgets, commitments: [], month: "2026-11" }).items[0]?.plannedAmount).toBe(
		8500,
	);
	expect(
		monthlyBudgetSummary({ budgets: [invoice], commitments: [], month: "2026-10" }).items[0]
			?.plannedAmount,
	).toBe(8500);
	expect(
		monthlyBudgetMovements({ budgets, commitments: [], from: "2026-09-01", through: "2026-11-30" }).map(
			row => row.amount,
		),
	).toEqual([8500, 7000, 8500]);
});

const parent: MonthlyBudget = { ...invoice, amount: 3000 };
const market: MonthlyBudget = {
	...invoice,
	amount: 500,
	categoryId: "market",
	id: "market",
	name: "Mercado",
	parentBudgetId: parent.id,
	source: "TAG",
};
test("nested categories reserve only the parent envelope", () => {
	const movements = monthlyBudgetMovements({
		budgets: [parent, market],
		commitments: [],
		from: "2026-10-01",
		through: "2026-10-31",
	});
	expect(movements.map(row => row.amount)).toEqual([3000]);
});
test("nested excess increases the parent and known payments consume its reserve", () => {
	const budgets = [parent, { ...market, amount: 3500 }];
	const commitments = [expense("payment", 2000)];
	const summary = monthlyBudgetSummary({ budgets, commitments, month: "2026-10" });
	expect(summary.items[0]).toMatchObject({
		additionalAmount: 1500,
		knownAmount: 2000,
		projectedAmount: 3500,
	});
	expect(
		monthlyBudgetMovements({ budgets, commitments, from: "2026-10-01", through: "2026-10-31" }).map(
			row => row.amount,
		),
	).toEqual([1500]);
});
test("multiple children and deeper nesting preserve aggregate envelope", () => {
	const budgets = [
		parent,
		{ ...market, amount: 2000 },
		{ ...market, amount: 1500, categoryId: "other", id: "other" },
		{ ...market, amount: 1000, categoryId: "deep", id: "deep", parentBudgetId: market.id },
	];
	expect(
		monthlyBudgetMovements({ budgets, commitments: [], from: "2026-10-01", through: "2026-10-31" }).map(
			row => row.amount,
		),
	).toEqual([3500]);
});
test("monthly overrides keep children inside the effective parent", () => {
	const override = { ...parent, amount: 4000, endMonth: "2026-10", id: "override", startMonth: "2026-10" };
	expect(
		monthlyBudgetMovements({
			budgets: [parent, market, override],
			commitments: [],
			from: "2026-10-01",
			through: "2026-10-31",
		}).map(row => row.amount),
	).toEqual([4000]);
});
test("child commitments roll up without adding a second reserve", () => {
	const commitments = [{ ...expense("market", 200), cardPayment: false, tagIds: ["market"] }];
	expect(
		monthlyBudgetMovements({
			budgets: [parent, market],
			commitments,
			from: "2026-10-01",
			through: "2026-10-31",
		}).map(row => row.amount),
	).toEqual([2800]);
});
test("hierarchy rejects cycles, missing parents, currencies and invalid validity", () => {
	expect(() =>
		validateBudgetHierarchy([parent, market], { ...parent, parentBudgetId: market.id }, parent.id),
	).toThrow("ciclo");
	expect(() => validateBudgetHierarchy([parent], { ...market, parentBudgetId: "missing" })).toThrow(
		"não encontrado",
	);
	expect(() => validateBudgetHierarchy([parent], { ...market, currency: "USD" })).toThrow("moeda");
	expect(() => validateBudgetHierarchy([{ ...parent, endMonth: "2026-10" }], market)).toThrow("Vigência");
});

test("shared tags across ancestor and child consume the commitment once", () => {
	const taggedParent = { ...parent, categoryId: "parent", source: "TAG" as const };
	const commitments = [{ ...expense("shared", 100), cardPayment: false, tagIds: ["parent", "market"] }];
	expect(
		monthlyBudgetSummary({ budgets: [taggedParent, market], commitments, month: "2026-10" }).items[0]
			?.knownAmount,
	).toBe(100);
	expect(
		monthlyBudgetMovements({
			budgets: [taggedParent, market],
			commitments,
			from: "2026-10-01",
			through: "2026-10-31",
		}).map(row => row.amount),
	).toEqual([2900]);
});

test("duplicate categories preserve adjustments and unrestricted reserves", () => {
	for (const source of ["TAG", "STATEMENTS"] as const) {
		const plan = { ...invoice, categoryId: source === "TAG" ? "food" : null, source };
		expect(hasBudgetConflict([plan], { ...plan, name: "Other" })).toBe(true);
		expect(hasBudgetConflict([plan], plan, plan.id)).toBe(false);
		expect(hasBudgetConflict([plan], { ...plan, endMonth: "2026-10", startMonth: "2026-10" })).toBe(
			false,
		);
	}
	expect(hasBudgetConflict([{ ...invoice, source: "CUSTOM" }], { ...invoice, source: "CUSTOM" })).toBe(
		false,
	);
});

test("uncategorized expenses and savings keep separate named plans and monthly overrides", () => {
	const custom: MonthlyBudget = { ...invoice, amount: 100, id: "gym", name: "Academia", source: "CUSTOM" };
	const reserve: MonthlyBudget = { ...custom, id: "savings", source: "RESERVE" };
	expect(sameBudgetPlan(custom, reserve)).toBe(false);
	for (const plan of [custom, reserve]) {
		expect(sameBudgetPlan(plan, { ...plan, name: "Investimentos" })).toBe(false);
		const adjustment = {
			...plan,
			amount: 150,
			endMonth: "2026-10",
			id: `${plan.id}-adjustment`,
			startMonth: "2026-10",
		};
		const other = { ...plan, id: `${plan.id}-other`, name: "Outro plano" };
		const summary = monthlyBudgetSummary({
			budgets: [plan, adjustment, other],
			commitments: [],
			month: "2026-10",
		});
		expect(summary.items.map(row => row.id)).toEqual([adjustment.id, other.id]);
	}
	const summary = monthlyBudgetSummary({
		budgets: [custom, reserve],
		commitments: [expense("card", 50)],
		month: "2026-10",
	});
	expect(summary.items.map(row => row.projectedAmount)).toEqual([100, 100]);
	expect(summary.items.map(row => row.knownAmount)).toEqual([0, 0]);
});

test("title envelopes reconcile matching transfers and expenses without consuming income or other titles", () => {
	const budget: MonthlyBudget = { ...invoice, amount: 1000, name: "Cartão de Ian", source: "CUSTOM" };
	const transfer = { ...expense("transfer", 600), description: " cartão DE Ian ", type: "TRANSFER" };
	const commitments = [
		transfer,
		transfer,
		{ ...expense("expense", 100), description: "Cartão de Ian" },
		{ ...expense("income", 900), description: "Cartão de Ian", type: "INCOME" },
		{ ...expense("other", 900), description: "Cartão de Ian extra" },
		{ ...transfer, date: "2026-09-10", id: "outside" },
	];
	expect(monthlyBudgetSummary({ budgets: [budget], commitments, month: "2026-10" }).items[0]).toMatchObject(
		{ additionalAmount: 300, knownAmount: 700 },
	);
	expect(
		monthlyBudgetMovements({
			budgets: [budget],
			commitments,
			from: "2026-10-01",
			through: "2026-10-31",
		})[0]?.amount,
	).toBe(300);
	expect(
		monthlyBudgetSummary({
			budgets: [{ ...budget, name: "" }],
			commitments: [{ ...transfer, description: "" }],
			month: "2026-10",
		}).items[0]?.knownAmount,
	).toBe(0);
});

test("uncategorized plans stay independent of commitments and override only their own name", () => {
	const budget: MonthlyBudget = { ...invoice, id: "organization", name: "Contas", source: "UNCATEGORIZED" };
	const other = { ...budget, id: "other", name: "Outros" };
	const adjustment = {
		...budget,
		amount: 100,
		endMonth: "2026-10",
		id: "adjustment",
		startMonth: "2026-10",
	};
	const items = monthlyBudgetSummary({
		budgets: [budget, other, adjustment],
		commitments: [{ ...expense("expense", 200), description: "Contas" }],
		month: "2026-10",
	}).items;
	expect(items.map(row => row.id)).toEqual(["other", "adjustment"]);
	expect(items.every(row => row.knownAmount === 0)).toBe(true);
	expect(items.find(row => row.id === "adjustment")?.projectedAmount).toBe(100);
	expect(hasBudgetConflict([budget], other)).toBe(false);
	expect(hasBudgetConflict([budget], budget)).toBe(true);
});
