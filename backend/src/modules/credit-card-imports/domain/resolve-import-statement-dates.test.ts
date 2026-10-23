import { expect, test } from "bun:test";
import { type CreditBook, materializeBookInstallments, newBookPurchase } from "@zaimu/finance/credit-book";
import {
	resolveImportStatementDates,
	synchronizeNextImportedStatement,
} from "./resolve-import-statement-dates";

const book: Pick<CreditBook, "card" | "statements"> = {
	card: {
		dueDay: 25,
		id: "card",
		ignoreStatementsBefore: null,
		institutionId: null,
		refundPolicy: null,
		statementDay: 11,
		userId: "owner",
	},
	statements: [
		{
			creditCardId: "card",
			dueDate: "2026-02-25",
			id: "february",
			isFullySynced: false,
			isPaid: false,
			paidAmount: 0,
			statementDate: "2026-02-12",
			totalAmount: 96.95,
		},
	],
};

test("due date alone preserves actual closing, ignoring nominal and next-cycle dates", () => {
	expect(resolveImportStatementDates({ dueDate: "2026-02-25" }, book)).toEqual({
		dueDate: "2026-02-25",
		statementDate: "2026-02-12",
	});
});

test("closing alone preserves actual due date", () => {
	expect(resolveImportStatementDates({ statementDate: "2026-02-12" }, book)).toEqual({
		dueDate: "2026-02-25",
		statementDate: "2026-02-12",
	});
});

test("explicit dates can correct an existing cycle without replacing absent dates", () => {
	expect(resolveImportStatementDates({ dueDate: "2026-02-26" }, book, "february")).toEqual({
		dueDate: "2026-02-26",
		statementDate: "2026-02-12",
	});
});

test("new cycles use card calendar, never copy due date into closing", () => {
	expect(resolveImportStatementDates({ dueDate: "2026-02-25" }, { ...book, statements: [] })).toEqual({
		dueDate: "2026-02-25",
		statementDate: "2026-02-11",
	});
});

test("missing and ambiguous periods cannot silently choose a cycle", () => {
	expect(() => resolveImportStatementDates({}, book)).toThrow("período");
	expect(() =>
		resolveImportStatementDates(
			{ dueDate: "2026-02-26" },
			{ ...book, statements: [...book.statements, { ...book.statements[0]!, id: "other" }] },
		),
	).toThrow("Mais de uma");
});

function nextCycleBook(): CreditBook {
	return {
		card: { ...book.card },
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [
			{ ...book.statements[0]!, dueDate: "2026-05-25", id: "may", statementDate: "2026-05-11" },
			{
				...book.statements[0]!,
				dueDate: "2026-06-26",
				id: "june",
				paidAmount: 10,
				statementDate: "2026-06-25",
			},
		],
	};
}

test("reimport with no new purchases corrects only next cycle and retains its links", () => {
	const state = nextCycleBook();
	const purchase = newBookPurchase(state, {
		description: "Amazon",
		installments: 1,
		purchaseDate: "2026-06-01",
		totalAmount: 11.63,
	});
	purchase.installmentStatementDates = [{ dueDate: "2026-06-26", statementDate: "2026-06-25" }];
	materializeBookInstallments(state, "2026-07-01");
	const current = structuredClone(state.statements.find(s => s.id === "may"));
	const installment = structuredClone(state.installments[0]);
	const originalCard = structuredClone(state.card);
	const result = synchronizeNextImportedStatement(state, "2026-06-12", "2026-05-11");
	expect(result.id).toBe("june");
	expect(result.statementDate).toBe("2026-06-12");
	expect(result.dueDate).toBe("2026-06-26");
	expect(result.paidAmount).toBe(10);
	expect(result.isFullySynced).toBe(false);
	expect(state.statements.find(s => s.id === "may")).toEqual(current);
	expect(state.installments[0]).toEqual(installment);
	expect(purchase.installmentStatementDates[0]).toEqual({
		dueDate: "2026-06-26",
		statementDate: "2026-06-12",
	});
	expect(state.card).toEqual(originalCard);
	const count = state.statements.length;
	synchronizeNextImportedStatement(state, "2026-06-12", "2026-05-11");
	expect(state.statements).toHaveLength(count);
});

test("next cycle can be created without changing current invoice or marking next synchronized", () => {
	const state = nextCycleBook();
	state.statements = state.statements.filter(s => s.id === "may");
	const result = synchronizeNextImportedStatement(state, "2026-06-12", "2026-05-11");
	expect(result.statementDate).toBe("2026-06-12");
	expect(result.dueDate).toBe("2026-06-25");
	expect(result.isFullySynced).toBe(false);
	expect(state.statements).toHaveLength(2);
	expect(() => synchronizeNextImportedStatement(state, "2026-05-10", "2026-05-11")).toThrow("posterior");
});
