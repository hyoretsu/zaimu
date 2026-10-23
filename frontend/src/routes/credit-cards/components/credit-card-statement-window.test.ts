import { describe, expect, test } from "bun:test";
import type { CreditCardStatement } from "@/lib/api";
import {
	getSelectedStatement,
	getStatementWindow,
	getStatementWindowRadius,
} from "./credit-card-statement-window";

const card = { dueDay: 15, id: "card-1", statementDay: 5 };
const actual: CreditCardStatement = {
	balanceAmount: 287.44,
	creditCardId: card.id,
	dueDate: "2026-08-15",
	id: "august-statement",
	isPaid: true,
	paidAmount: 287.44,
	statementDate: "2026-08-05",
	totalAmount: 287.44,
};

describe("credit card statement window", () => {
	test("mobile starts at the first non-zero invoice and keeps recorded invoices", () => {
		const window = getStatementWindow(card, [actual], "2026-09", 3, 3);
		expect(window).toEqual([actual]);
	});

	test("does not invent historical invoices when no non-zero invoice exists", () => {
		const window = getStatementWindow(card, [], "2026-01", 6, 6);
		expect(window).toEqual([]);
	});

	test("hides recorded zero invoices before the first non-zero invoice", () => {
		const oldZero = {
			...actual,
			balanceAmount: 0,
			dueDate: "2026-01-15",
			id: "old-zero",
			paidAmount: 0,
			statementDate: "2026-01-05",
			totalAmount: 0,
		};
		const window = getStatementWindow(card, [oldZero, actual], "2026-09", 12, 3);
		expect(window[0]).toEqual(actual);
		expect(window.map(statement => statement.id)).not.toContain("old-zero");
	});

	test("starts at first recorded invoice when it falls after current month", () => {
		const window = getStatementWindow(card, [actual], "2026-01", 3, 3);
		expect(window[0]).toEqual(actual);
	});

	test("hides zero totals in any month even with payments or charges", () => {
		const zero = { ...actual, dueDate: "2026-09-15", id: "zero", totalAmount: 0 };
		expect(getStatementWindow(card, [actual, zero], "2026-09", 3, 3)).toEqual([actual]);
	});

	test("keeps paid invoices and negative totals across gaps between months", () => {
		const credit = { ...actual, dueDate: "2028-01-15", id: "credit", totalAmount: -20 };
		expect(getStatementWindow(card, [credit, actual], "2026-09", 3, 3)).toEqual([actual, credit]);
	});

	test("desktop keeps two extra items beyond the visible center on each side", () => {
		expect(getStatementWindowRadius(true, 612, 60)).toBe(6);
		expect(getStatementWindowRadius(false, 612, 60)).toBe(3);
	});
});

describe("credit card statement selection", () => {
	test("selects and recovers the second invoice by ID when due months match", () => {
		const second = { ...actual, id: "second-august-statement", totalAmount: 43.14 };
		const statements = [actual, second];
		expect(getSelectedStatement(statements, second.id, "2026-08")).toBe(second);
		expect(getSelectedStatement([...statements], second.id, "2026-09")).toBe(second);
	});

	test("defaults to current month and falls back after selected invoice disappears", () => {
		const september = { ...actual, dueDate: "2026-09-15", id: "september-statement" };
		const statements = [actual, september];
		expect(getSelectedStatement(statements, null, "2026-09")).toBe(september);
		expect(getSelectedStatement(statements, "deleted", "2026-09")).toBe(september);
		expect(getSelectedStatement(statements, "deleted", "2026-10")).toBe(actual);
		expect(getSelectedStatement([], null, "2026-09")).toBeUndefined();
	});
});

test("window never splits a duplicate month at either edge", () => {
	const first = { ...actual, dueDate: "2026-09-08", id: "first" };
	const second = { ...first, dueDate: "2026-09-24", id: "second" };
	const visible = getStatementWindow(card, [second, first], "2026-09", 0, 0);
	expect(visible.map(item => item.id)).toEqual(["first", "second"]);
});
