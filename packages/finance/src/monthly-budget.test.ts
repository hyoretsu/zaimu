import { expect, test } from "bun:test";
import { dailyForecast } from "./daily-forecast";
import { type MonthlyBudget, monthlyBudgetMovements, monthlyBudgetSummary } from "./monthly-budget";

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
