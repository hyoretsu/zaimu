import { expect, test } from "bun:test";
import { type CreditBook, newBookPurchase, replayCreditBook } from "./credit-book";
import { type RecurrenceDefinition, recurrenceAccountEffects } from "./recurrence";
import { projectRecurrenceCreditBook } from "./recurrence-projection";

const recurrence = (movement: RecurrenceDefinition["movement"], amount = 30): RecurrenceDefinition => ({
	amount,
	createdAt: "",
	creditCardId: movement.startsWith("CARD") ? "card" : null,
	dayOfMonth: 10,
	destinationFinancialAccountId: ["INCOME", "TRANSFER"].includes(movement) ? "b" : null,
	id: movement,
	interval: 1,
	isActive: true,
	materializedThrough: "2026-09-30",
	movement,
	name: "Generic",
	originFinancialAccountId: movement === "INCOME" || movement === "CARD_PURCHASE" ? null : "a",
	startDate: "2026-10-01",
	unit: "MONTH",
	updatedAt: "",
	userId: "owner",
});
test("account projections retain own transfer and do not count purchase as cash outflow", () => {
	const effects = recurrenceAccountEffects(
		[
			recurrence("INCOME"),
			recurrence("EXPENSE"),
			recurrence("TRANSFER"),
			recurrence("CARD_PURCHASE"),
			recurrence("CARD_PAYMENT"),
		],
		"2026-10-01",
		"2026-10-31",
	);
	expect(effects.get("a")).toBe(-90);
	expect(effects.get("b")).toBe(60);
	expect(
		recurrenceAccountEffects(
			[recurrence("EXPENSE")],
			"2026-10-01",
			"2026-10-31",
			new Set(["EXPENSE:2026-10-10"]),
		).size,
	).toBe(0);
});
test("ephemeral card purchase enters correct cycle and fixed payment reduces residual only once", () => {
	const book: CreditBook = {
		card: {
			dueDay: 25,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 15,
			userId: "owner",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(book, {
		description: "Existing",
		installments: 1,
		purchaseDate: "2026-10-01",
		totalAmount: 100,
	});
	const before = JSON.stringify(book);
	const projected = projectRecurrenceCreditBook(
		book,
		[recurrence("CARD_PURCHASE", 50), recurrence("CARD_PAYMENT", 40)],
		"2026-10-01",
		"2026-10-31",
	);
	expect(JSON.stringify(book)).toBe(before);
	expect(projected.purchases).toHaveLength(2);
	expect(projected.purchases[1]!.debtSplitRule).toBeNull();
	expect(projected.purchases[1]!.cashbackAccountId).toBeNull();
	expect(projected.payments).toHaveLength(1);
	const replay = replayCreditBook(projected, "2026-10-31");
	expect(replay.statements.reduce((sum, s) => sum + s.balanceAmount, 0)).toBe(110);
});

test("forecast projection leaves unmaterialized historical purchases unchanged", () => {
	const book: CreditBook = {
		card: {
			dueDay: 25,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 15,
			userId: "owner",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(
		book,
		{ description: "Pending worker", installments: 1, purchaseDate: "2026-08-01", totalAmount: 100 },
		undefined,
		{ materialize: false },
	);
	const before = JSON.stringify(book);
	const projected = projectRecurrenceCreditBook(
		book,
		[recurrence("CARD_PURCHASE", 50)],
		"2026-10-01",
		"2026-10-31",
	);
	expect(JSON.stringify(book)).toBe(before);
	expect(projected.purchases).toHaveLength(2);
	expect(projected.installments).toEqual([]);
	expect(projected.statements).toEqual([]);
	expect(
		replayCreditBook(projected, "2026-10-31").statements.reduce((sum, row) => sum + row.balanceAmount, 0),
	).toBe(150);
});

test("advanced card occurrences never produce another forecast, including fixed payments", () => {
	const book: CreditBook = {
		card: {
			dueDay: 25,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 15,
			userId: "owner",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	const projected = projectRecurrenceCreditBook(
		book,
		[recurrence("CARD_PURCHASE"), recurrence("CARD_PAYMENT")],
		"2026-10-01",
		"2026-11-30",
		[
			{ date: "2026-10-10", recurrenceId: "CARD_PURCHASE" },
			{ date: "2026-10-10", recurrenceId: "CARD_PAYMENT" },
		],
	);
	expect(projected.purchases.map(row => row.recurrenceOccurrenceDate)).toEqual(["2026-11-10"]);
	expect(projected.payments.map(row => row.date)).toEqual(["2026-11-10"]);
	expect(book.purchases).toHaveLength(0);
	expect(book.payments).toHaveLength(0);
});

const emptySubscriptionBook = (): CreditBook => ({
	card: {
		dueDay: 25,
		id: "card",
		ignoreStatementsBefore: null,
		institutionId: null,
		refundPolicy: null,
		statementDay: 15,
		userId: "owner",
	},
	charges: [],
	installments: [],
	payments: [],
	purchases: [],
	refunds: [],
	statements: [],
});

test("annual subscription projects monthly installments without persisting any ledger records", () => {
	const book = emptySubscriptionBook();
	const before = JSON.stringify(book);
	const annual: RecurrenceDefinition = {
		...recurrence("CARD_PURCHASE", 57),
		dayOfMonth: 24,
		installments: 3,
		startDate: "2026-04-01",
		unit: "YEAR",
	};
	const projected = projectRecurrenceCreditBook(book, [annual], "2026-04-01", "2026-04-30");
	expect(projected.purchases[0]!.installmentAmountsCents).toEqual([1900, 1900, 1900]);
	const replay = replayCreditBook(projected, "2026-04-30");
	expect(replay.statements.map(row => [row.statementDate, row.totalAmount])).toEqual([
		["2026-05-15", 19],
		["2026-06-15", 19],
		["2026-07-15", 19],
	]);
	expect(JSON.stringify(book)).toBe(before);
	expect(projected.installments).toEqual([]);
	expect(projected.statements).toEqual([]);
});

test("each annual renewal gets its own installment plan and processed occurrences stay excluded", () => {
	const annual: RecurrenceDefinition = {
		...recurrence("CARD_PURCHASE", 100),
		installments: 3,
		unit: "YEAR",
	};
	const projected = projectRecurrenceCreditBook(
		emptySubscriptionBook(),
		[annual],
		"2026-10-01",
		"2027-10-31",
	);
	expect(
		projected.purchases.map(row => [row.recurrenceOccurrenceDate, row.installmentAmountsCents]),
	).toEqual([
		["2026-10-10", [3334, 3333, 3333]],
		["2027-10-10", [3334, 3333, 3333]],
	]);
	const deduplicated = projectRecurrenceCreditBook(projected, [annual], "2026-10-01", "2027-10-31");
	expect(deduplicated.purchases).toHaveLength(2);
	const processed = projectRecurrenceCreditBook(
		emptySubscriptionBook(),
		[annual],
		"2026-10-01",
		"2027-10-31",
		[{ date: "2026-10-10", recurrenceId: annual.id }],
	);
	expect(processed.purchases.map(row => row.recurrenceOccurrenceDate)).toEqual(["2027-10-10"]);
});

test("legacy card recurrence forecasts a single payment", () => {
	const projected = projectRecurrenceCreditBook(
		emptySubscriptionBook(),
		[recurrence("CARD_PURCHASE", 57)],
		"2026-10-01",
		"2026-10-31",
	);
	expect(projected.purchases[0]!.installmentAmountsCents).toEqual([5700]);
});
