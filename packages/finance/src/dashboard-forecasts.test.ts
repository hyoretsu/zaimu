import { expect, test } from "bun:test";
import { forecastCardPayments } from "./card-forecast";
import { type CreditBook, newBookPurchase } from "./credit-book";
import { dashboardCardForecasts, isCashFlowRecurrence } from "./dashboard-forecasts";
import type { RecurrenceDefinition } from "./recurrence";
import { projectRecurrenceCreditBook } from "./recurrence-projection";

test("cash flow lists account recurrences and card payments, with purchases confined to invoices", () => {
	expect(isCashFlowRecurrence({ movement: "CARD_PURCHASE" })).toBe(false);
	expect(isCashFlowRecurrence({ movement: "TRANSFER" })).toBe(false);
	for (const movement of ["INCOME", "EXPENSE", "CARD_PAYMENT"] as const)
		expect(isCashFlowRecurrence({ movement })).toBe(true);
});

test("invoice forecasts include subscriptions and installments after deducting payments once", () => {
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
		description: "Parcelamento",
		installments: 2,
		purchaseDate: "2026-10-01",
		totalAmount: 200,
	});
	const recurrence = (
		movement: "CARD_PURCHASE" | "CARD_PAYMENT",
		amount: number,
	): RecurrenceDefinition => ({
		amount,
		createdAt: "",
		creditCardId: "card",
		dayOfMonth: 10,
		id: movement,
		interval: 1,
		isActive: true,
		materializedThrough: "2026-10-04",
		movement,
		name: movement,
		originFinancialAccountId: movement === "CARD_PAYMENT" ? "account" : null,
		startDate: "2026-10-01",
		unit: "MONTH",
		updatedAt: "",
		userId: "owner",
	});
	const original = JSON.stringify(book);
	const projected = projectRecurrenceCreditBook(
		book,
		[recurrence("CARD_PURCHASE", 50), recurrence("CARD_PAYMENT", 40)],
		"2026-10-05",
		"2026-11-30",
	);
	const forecasts = dashboardCardForecasts(
		forecastCardPayments(projected, "2026-10-05", "2026-11-30"),
		[{ id: "card", institutionName: "Banco", name: "Meu cartão" }],
		"2026-10-04",
	);
	expect(forecasts.map(item => [item.date, item.amount])).toEqual([
		["2026-10-25", 110],
		["2026-11-25", 110],
	]);
	expect(forecasts.every(item => item.type === "CARD" && item.name === "Meu cartão")).toBe(true);
	expect(JSON.stringify(book)).toBe(original);
});

test("paid, credited, past and today's invoices do not appear as future expenses", () => {
	const statement = (id: string, dueDate: string, balanceAmount: number, creditCardId = "card") => ({
		balanceAmount,
		creditCardId,
		dueDate,
		id,
	});
	const forecasts = dashboardCardForecasts(
		[
			statement("past", "2026-10-03", 100),
			statement("today", "2026-10-04", 100),
			statement("paid", "2026-10-05", 0),
			statement("credit", "2026-10-05", -20),
			statement("hidden", "2026-10-05", 100, "hidden-card"),
			statement("future", "2026-11-25T12:00:00", 95.99),
		],
		[{ id: "card", institutionName: "Banco", name: " " }],
		"2026-10-04",
	);
	expect(forecasts).toEqual([
		{
			amount: 95.99,
			date: "2026-11-25",
			direction: "EXPENSE",
			id: "statement-future",
			name: "Banco",
			sourceId: "card",
			type: "CARD",
		},
	]);
});
