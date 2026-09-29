import { describe, expect, test } from "bun:test";
import {
	addBookRefund,
	type CreditBook,
	creditBookConsumption,
	creditBookEntries,
	creditBookPlan,
	creditBookRewards,
	ensureBookStatement,
	materializeBookInstallments,
	moveBookPurchase,
	newBookPurchase,
	refinanceBookPurchase,
	refundDebtAmounts,
	removeBookRefund,
	replayCreditBook,
	updateBookPurchaseDate,
	updateBookRefund,
} from "./credit-book";

function emptyBook(): CreditBook {
	return {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: "bank",
			refundPolicy: null,
			statementDay: 20,
			userId: "owner",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
}

describe("normalized credit book", () => {
	test("starts an August 26 purchase in September when the card closes August 15", () => {
		const book = emptyBook();
		book.card.statementDay = 15;
		book.card.dueDay = 20;
		const purchase = newBookPurchase(book, {
			description: "AliExpress",
			installments: 12,
			purchaseDate: "2026-08-26",
			totalAmount: 413.52,
		});
		const plan = creditBookPlan(book);
		expect(
			plan.installments
				.slice(0, 3)
				.map(
					installment =>
						plan.statements.find(statement => statement.id === installment.statementId)
							?.statementDate,
				),
		).toEqual(["2026-09-15", "2026-10-15", "2026-11-15"]);
		expect(creditBookEntries(book).filter(entry => entry.purchaseId === purchase.id)[0]).toMatchObject({
			currentInstallment: 1,
			installmentAmount: 34.46,
			purchaseDate: "2026-08-26",
		});
	});
	test("assigns closing-day purchases to the next invoice in plans and materialized records", () => {
		const book = emptyBook();
		const current = ensureBookStatement(book, "2025-01-19");
		const purchase = newBookPurchase(book, {
			description: "Compra no fechamento",
			installments: 1,
			purchaseDate: "2025-01-20",
			totalAmount: 100,
		});
		const installment = book.installments.find(item => item.purchaseId === purchase.id)!;
		expect(book.statements.find(item => item.id === installment.statementId)?.statementDate).toBe(
			"2025-02-20",
		);
		expect(creditBookPlan(book).installments[0]?.statementId).toBe(installment.statementId);
		expect(installment.statementId).not.toBe(current.id);
	});
	test("moves manual purchases from closed invoices with installments and refunds intact", () => {
		const source = emptyBook();
		const destination = emptyBook();
		destination.card.id = "another-card";
		destination.card.statementDay = 10;
		const purchase = newBookPurchase(source, {
			description: "Compra antiga",
			installments: 2,
			purchaseDate: "2025-01-01",
			totalAmount: 100,
		});
		materializeBookInstallments(source, "2025-03-01");
		const refund = addBookRefund(source, purchase.id, { amount: 20, creditDate: "2025-02-15" });
		const installmentIds = source.installments.map(item => item.id);
		moveBookPurchase(source, destination, installmentIds[0]!);
		expect(source.purchases).toHaveLength(0);
		expect(source.installments).toHaveLength(0);
		expect(source.refunds).toHaveLength(0);
		expect(destination.purchases[0]).toMatchObject({ creditCardId: "another-card", id: purchase.id });
		expect(destination.installments.map(item => item.id)).toEqual(installmentIds);
		expect(
			destination.installments.every(item =>
				destination.statements.some(statement => statement.id === item.statementId),
			),
		).toBe(true);
		expect(destination.refunds[0]).toMatchObject({ id: refund.id, purchaseId: purchase.id });
		expect(
			replayCreditBook(destination, "2025-03-01").statements.some(item => item.totalAmount > 0),
		).toBe(true);
	});
	test("rejects a purchase when any installment was imported", () => {
		const source = emptyBook();
		const destination = emptyBook();
		destination.card.id = "another-card";
		const purchase = newBookPurchase(source, {
			description: "Importada",
			installments: 2,
			purchaseDate: "2025-01-01",
			totalAmount: 100,
		});
		materializeBookInstallments(source, "2025-02-01");
		source.installments[0]!.hasImportedAmount = true;
		expect(() => moveBookPurchase(source, destination, purchase.id)).toThrow(
			"Compras sincronizadas não podem mudar de cartão",
		);
		expect(source.purchases).toHaveLength(1);
		expect(destination.purchases).toHaveLength(0);
	});
	test("net consumption and reward reversals retain distinct purchase and credit dates", () => {
		const book = emptyBook();
		const purchase = newBookPurchase(book, {
			cashbackAccountId: "rewards",
			cashbackAmount: 3,
			description: "Compra",
			installments: 3,
			purchaseDate: "2025-01-01",
			totalAmount: 300,
		});
		const first = addBookRefund(book, purchase.id, { amount: 75, creditDate: "2025-02-01" });
		const second = addBookRefund(book, purchase.id, { amount: 25, creditDate: "2025-03-01" });
		expect(
			creditBookConsumption(book)
				.filter(row => !row.isRefund)
				.map(row => [row.purchaseDate, row.totalAmount]),
		).toEqual([["2025-01-01", 200]]);
		expect(creditBookRewards(book).map(row => [row.purchaseDate, row.cashbackAmount])).toEqual([
			["2025-01-01", 3],
			["2025-02-01", -0.75],
			["2025-03-01", -0.25],
		]);
		updateBookRefund(book, purchase.id, first.id, { amount: 100 });
		removeBookRefund(book, purchase.id, second.id);
		expect(creditBookRewards(book).map(row => row.cashbackAmount)).toEqual([3, -1]);
	});
	test("canceled first occurrence retains zero net consumption and cumulative reward rounding", () => {
		const book = emptyBook();
		const p = newBookPurchase(book, {
			cashbackAccountId: "rewards",
			cashbackAmount: 1,
			description: "Compra",
			installments: 3,
			purchaseDate: "2025-02-01",
			totalAmount: 3,
		});
		addBookRefund(book, p.id, { creditDate: "2025-01-10", policy: "CANCEL_FUTURE_INSTALLMENTS" });
		expect(
			creditBookConsumption(book).find(row => row.purchaseId === p.id && !row.isRefund)?.totalAmount,
		).toBe(0);
		const partial = emptyBook();
		const q = newBookPurchase(partial, {
			cashbackAccountId: "rewards",
			cashbackAmount: 1,
			description: "Compra",
			installments: 1,
			purchaseDate: "2025-01-01",
			totalAmount: 3,
		});
		for (let i = 0; i < 3; i++)
			addBookRefund(partial, q.id, { amount: 1, creditDate: `2025-01-${10 + i}` });
		expect(creditBookRewards(partial).map(row => row.cashbackAmount)).toEqual([
			1, -0.3333, -0.3334, -0.3333,
		]);
	});
	test("explicit date edits preserve IDs and imported statement calendars", () => {
		const book = emptyBook();
		const p = newBookPurchase(book, {
			description: "Compra",
			installments: 2,
			purchaseDate: "2025-01-01",
			totalAmount: 100,
		});
		const ids = book.installments.map(i => i.id);
		p.installmentImportedNumbers = [2];
		p.installmentStatementDates = [null, { dueDate: "2025-02-28", statementDate: "2025-02-18" }];
		updateBookPurchaseDate(book, p.id, "2025-01-25");
		expect(book.installments.map(i => i.id)).toEqual(ids);
		expect(book.installments.map(i => i.occurrenceDate)).toEqual(["2025-01-25", "2025-02-25"]);
		expect(book.statements.find(s => s.id === book.installments[1]!.statementId)?.statementDate).toBe(
			"2025-02-18",
		);
	});
	test("refinancing ignores canceled principal and preserves settlement references", () => {
		const book = emptyBook();
		const p = newBookPurchase(book, {
			description: "Compra",
			installments: 3,
			purchaseDate: "2025-01-01",
			totalAmount: 300,
		});
		addBookRefund(book, p.id, { creditDate: "2025-01-10", policy: "CANCEL_FUTURE_INSTALLMENTS" });
		const result = refinanceBookPurchase(book, p.id, {
			feeAmount: 5,
			installments: 2,
			purchaseDate: "2025-01-15",
		});
		expect(result).toEqual({ settledAmount: 100, totalAmount: 105 });
		expect(book.installments.filter(i => i.purchaseId === p.id && i.isSettled)).toHaveLength(1);
		expect(book.installments.find(i => i.purchaseId === p.id && i.isSettled)?.settledByPurchaseId).toBe(
			book.purchases.at(-1)!.id,
		);
	});
	test("only due installments become records; forecasts inherit canonical metadata", () => {
		const book = emptyBook();
		const p = newBookPurchase(book, {
			description: "Compra",
			installments: 3,
			purchaseDate: "2099-01-31",
			totalAmount: 10,
		});
		expect(book.installments).toHaveLength(0);
		expect(creditBookEntries(book).map(row => row.installmentAmount)).toEqual([3.34, 3.33, 3.33]);
		materializeBookInstallments(book, "2099-02-28");
		expect(book.installments.map(row => row.occurrenceDate)).toEqual(["2099-01-31", "2099-02-28"]);
		p.description = "Revisada";
		expect(creditBookEntries(book).every(row => row.description === "Revisada")).toBe(true);
		expect("totalAmount" in p).toBe(false);
	});
	test("full refund cancels future cycles and credits only difference, including paid invoices", () => {
		const book = emptyBook();
		const p = newBookPurchase(book, {
			description: "Compra",
			installments: 3,
			purchaseDate: "2025-01-01",
			totalAmount: 300,
		});
		book.statements.forEach(s => {
			s.isPaid = true;
			s.paidAmount = 100;
		});
		const r = addBookRefund(book, p.id, {
			creditDate: "2025-01-10",
			policy: "CANCEL_FUTURE_INSTALLMENTS",
		});
		expect(book.card.refundPolicy).toBe("CANCEL_FUTURE_INSTALLMENTS");
		expect(creditBookEntries(book).find(row => row.id === r.id)?.installmentAmount).toBe(-100);
		expect(creditBookEntries(book).filter(row => row.entryKind === "INSTALLMENT")).toHaveLength(1);
		updateBookRefund(book, p.id, r.id, { amount: 150 });
		expect(book.refunds[0]?.id).toBe(r.id);
		expect(creditBookEntries(book).filter(row => row.entryKind === "INSTALLMENT")).toHaveLength(3);
		updateBookRefund(book, p.id, r.id, { amount: 300 });
		expect(book.refunds[0]?.cancellationEligible).toBe(false);
	});
	test("multiple partial refunds never cancel and deleted history prevents later promotion", () => {
		const book = emptyBook();
		const p = newBookPurchase(book, {
			description: "Compra",
			installments: 3,
			purchaseDate: "2025-01-01",
			totalAmount: 300,
		});
		const r = addBookRefund(book, p.id, { amount: 100, creditDate: "2025-01-10" });
		expect(() => addBookRefund(book, p.id, { amount: 201, creditDate: "2025-01-10" })).toThrow();
		removeBookRefund(book, p.id, r.id);
		const full = addBookRefund(book, p.id, { creditDate: "2025-01-10" });
		expect(full.cancellationEligible).toBe(false);
		expect(creditBookEntries(book).filter(row => row.entryKind === "INSTALLMENT")).toHaveLength(3);
	});
	test("registered calendar and standalone settlement flag survive replay", () => {
		const book = emptyBook();
		const p = newBookPurchase(book, {
			description: "Compra",
			installments: 3,
			purchaseDate: "2025-01-01",
			totalAmount: 300,
		});
		book.installments[0]!.isSettled = true;
		const ledger = replayCreditBook(book, "2025-04-01");
		expect(ledger.statements.find(s => s.id === book.installments[0]!.statementId)?.totalAmount).toBe(0);
		expect(creditBookEntries(book)[0]?.isSettled).toBe(true);
		expect(p.totalAmountCents).toBe(30000);
	});
	test("cumulative refund debt allocation preserves fixed participant shares in cents", () => {
		const amounts = Array.from({ length: 3 }, (_, index) => refundDebtAmounts(3, [1, 1], index, 1));
		expect(amounts).toEqual([
			[0, 0],
			[0, 0],
			[1, 1],
		]);
		expect(() => refundDebtAmounts(3, [1, 1], 2, 2)).toThrow();
	});
});
