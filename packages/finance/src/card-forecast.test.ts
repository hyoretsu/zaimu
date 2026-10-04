import { expect, test } from "bun:test";
import { forecastCardPayments, recurringCardPaymentAmounts } from "./card-forecast";
import { addBookRefund, type CreditBook, newBookPurchase } from "./credit-book";

test("forecast settles earlier cycles before computing later remaining amounts", () => {
	const book: CreditBook = {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "user",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(book, {
		description: "Plano",
		id: "p",
		installments: 2,
		purchaseDate: "2026-10-01",
		recurrenceId: "subscription",
		totalAmount: 200,
	});
	const payments = forecastCardPayments(book, "2026-10-04", "2026-12-31");
	expect(payments.map(payment => payment.balanceAmount)).toEqual([100, 100]);
	expect(payments.map(payment => payment.recurringAmount)).toEqual([100, 100]);
	expect(book.payments).toHaveLength(0);
});

test("fixed recurring payments and partial payments reduce future settlement once", () => {
	const book: CreditBook = {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "user",
		},
		charges: [],
		installments: [],
		payments: [
			{ amount: 20, date: "2026-10-21", id: "partial" },
			{ amount: 30, date: "2026-10-25", id: "fixed-recurring" },
		],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(book, {
		description: "Plano",
		id: "p",
		installments: 2,
		purchaseDate: "2026-10-01",
		recurrenceId: "subscription",
		totalAmount: 200,
	});
	const payments = forecastCardPayments(book, "2026-10-04", "2026-12-31");
	expect(payments.map(payment => payment.balanceAmount)).toEqual([50, 100]);
	expect([...recurringCardPaymentAmounts(book).values()]).toEqual([20, 30]);
});
test("mixed historical payment allocates subscriptions proportionally", () => {
	const book: CreditBook = {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "user",
		},
		charges: [],
		installments: [],
		payments: [{ amount: 50, date: "2026-10-25", id: "payment" }],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(book, {
		description: "Plano",
		id: "subscription",
		installments: 1,
		purchaseDate: "2026-10-01",
		recurrenceId: "subscription",
		totalAmount: 100,
	});
	newBookPurchase(book, {
		description: "Compra",
		id: "other",
		installments: 1,
		purchaseDate: "2026-10-01",
		totalAmount: 100,
	});
	expect(recurringCardPaymentAmounts(book).get("payment")).toBe(25);
	const payments = forecastCardPayments(book, "2026-10-04", "2026-11-30");
	expect(payments.reduce((sum, payment) => sum + payment.balanceAmount, 0)).toBe(150);
	expect(payments.reduce((sum, payment) => sum + payment.recurringAmount, 0)).toBe(75);
});

test("purchase credit reduces remaining statement without duplicate settlement", () => {
	const book: CreditBook = {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "user",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(book, {
		description: "Plano",
		id: "subscription",
		installments: 1,
		purchaseDate: "2026-09-21",
		recurrenceId: "subscription",
		totalAmount: 100,
	});
	newBookPurchase(book, {
		description: "Compra",
		id: "other",
		installments: 1,
		purchaseDate: "2026-09-21",
		totalAmount: 100,
	});
	addBookRefund(book, "other", { amount: 50, creditDate: "2026-10-02" });
	const payments = forecastCardPayments(book, "2026-10-04", "2026-12-31");
	expect(payments.reduce((sum, payment) => sum + payment.balanceAmount, 0)).toBe(150);
	expect(payments.reduce((sum, payment) => sum + payment.recurringAmount, 0)).toBe(100);
});

test("payment before closing allocates subscriptions proportionally", () => {
	const book: CreditBook = {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "user",
		},
		charges: [],
		installments: [],
		payments: [{ amount: 50, date: "2026-10-10", id: "payment" }],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(book, {
		description: "Plano",
		id: "subscription",
		installments: 1,
		purchaseDate: "2026-10-01",
		recurrenceId: "subscription",
		totalAmount: 100,
	});
	newBookPurchase(book, {
		description: "Compra",
		id: "other",
		installments: 1,
		purchaseDate: "2026-10-01",
		totalAmount: 100,
	});
	expect(recurringCardPaymentAmounts(book).get("payment")).toBe(25);
	const payments = forecastCardPayments(book, "2026-10-04", "2026-11-30");
	expect(payments.reduce((sum, payment) => sum + payment.balanceAmount, 0)).toBe(150);
	expect(payments.reduce((sum, payment) => sum + payment.recurringAmount, 0)).toBe(75);
});
