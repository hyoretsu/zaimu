import { describe, expect, test } from "bun:test";
import {
	addBookRefund,
	type CreditBook,
	creditBookEntries,
	materializeBookInstallments,
	newBookPurchase,
	refundDebtAmounts,
	removeBookRefund,
	replayCreditBook,
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
