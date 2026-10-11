import { describe, expect, test } from "bun:test";
import {
	addBookRefund,
	bookRefinancingLinks,
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
	removeBookPurchase,
	removeBookRefund,
	replayCreditBook,
	resizePurchaseCashback,
	synchronizeBookRefinancing,
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
	test("single purchase can be refinanced with an explicit new total", () => {
		const book = emptyBook();
		const source = newBookPurchase(book, {
			description: "Wlingua",
			installments: 1,
			purchaseDate: "2025-01-18",
			totalAmount: 159.99,
		});
		expect(
			refinanceBookPurchase(book, source.id, {
				installments: 12,
				purchaseDate: "2025-01-18",
				totalAmount: 199.92,
			}),
		).toEqual({ settledAmount: 159.99, totalAmount: 199.92 });
		const replacement = book.purchases.at(-1)!;
		expect(replacement.installmentAmountsCents).toEqual(Array(12).fill(1666));
		expect(replacement.refinancingFeeAmount).toBe(39.93);
		expect(book.installments.find(row => row.purchaseId === source.id)?.settledByPurchaseId).toBe(
			replacement.id,
		);
		expect(() =>
			refinanceBookPurchase(book, source.id, {
				installments: 2,
				purchaseDate: "2025-01-18",
				totalAmount: 100,
			}),
		).toThrow("Não há parcelas disponíveis");
	});
	test("refinancing settles future forecasts and leaves paid installments intact", () => {
		const book = emptyBook();
		const source = newBookPurchase(book, {
			description: "Compra",
			installments: 3,
			purchaseDate: "2099-01-01",
			totalAmount: 100,
		});
		materializeBookInstallments(book, "2099-01-01");
		const first = book.installments[0]!;
		const paid = book.statements.find(row => row.id === first.statementId)!;
		paid.isPaid = true;
		paid.paidAmount = 33.34;
		expect(
			refinanceBookPurchase(book, source.id, {
				installments: 2,
				purchaseDate: "2099-02-01",
				totalAmount: 80,
			}),
		).toEqual({ settledAmount: 66.66, totalAmount: 80 });
		expect(first.isSettled).not.toBe(true);
		expect(
			creditBookEntries(book).filter(row => row.purchaseId === source.id && row.isSettled),
		).toHaveLength(2);
	});
	test("invalid refinancing input cannot mutate the book", () => {
		const book = emptyBook();
		const source = newBookPurchase(book, {
			description: "Compra",
			installments: 1,
			purchaseDate: "2025-01-01",
			totalAmount: 100,
		});
		for (const input of [
			{ installments: 2, totalAmount: Number.NaN },
			{ installments: 2, totalAmount: Number.POSITIVE_INFINITY },
			{ installments: 2, totalAmount: 0 },
			{ installments: 1.5, totalAmount: 100 },
			{ installments: 49, totalAmount: 100 },
		]) {
			expect(() =>
				refinanceBookPurchase(book, source.id, { ...input, purchaseDate: "2025-01-01" }),
			).toThrow();
			expect(book.purchases).toHaveLength(1);
			expect(book.installments.some(row => row.isSettled)).toBe(false);
		}
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

test("JPY book distributes indivisible units and retains purchase-date original currency", () => {
	const book = emptyBook();
	book.card.currency = "JPY";
	const purchase = newBookPurchase(book, {
		currency: "USD",
		description: "Imported USD purchase",
		exchangeRate: 147.205882,
		installments: 3,
		originalAmount: 6.8,
		purchaseDate: "2026-01-01",
		totalAmount: 1001,
	});
	expect(purchase.bookingCurrency).toBe("JPY");
	expect(purchase.totalAmountCents).toBe(1001);
	expect(purchase.installmentAmountsCents).toEqual([334, 334, 333]);
	const entries = creditBookEntries(book);
	expect(
		entries.filter(entry => !entry.isRefund).reduce((sum, entry) => sum + entry.installmentAmount, 0),
	).toBe(1001);
	const replay = replayCreditBook(book, "2026-01-10");
	expect(replay.statements[0]?.totalAmount).toBe(334);
	expect(purchase.originalAmount).toBe(6.8);
	expect(() =>
		newBookPurchase(book, {
			description: "Invalid fractional yen",
			installments: 1,
			purchaseDate: "2026-01-01",
			totalAmount: 1.5,
		}),
	).toThrow();
});
test("KWD book preserves three decimals through refunds and payment replay", () => {
	const book = emptyBook();
	book.card.currency = "KWD";
	const purchase = newBookPurchase(book, {
		description: "Kuwait",
		installments: 1,
		purchaseDate: "2026-01-01",
		totalAmount: 1.001,
	});
	addBookRefund(book, purchase.id, {
		amount: 0.001,
		creditDate: "2026-01-02",
		policy: "KEEP_INSTALLMENTS",
	});
	book.payments.push({ amount: 1, date: "2026-01-03", id: "payment" });
	const rows = creditBookEntries(book);
	expect(rows.find(row => row.isRefund)?.installmentAmount).toBe(-0.001);
	const invoice = replayCreditBook(book, "2026-01-30").statements.find(
		row => row.statementDate === "2026-01-20",
	);
	expect(invoice?.totalAmount).toBe(1);
	expect(invoice?.balanceAmount).toBe(0);
});

test("native cashback reversals conserve KWD thousandths and JPY units", () => {
	for (const [currency, amount, expected] of [
		["KWD", 1.001, [1.001, -0.334, -0.333, -0.334]],
		["JPY", 1, [1, 0, -1, 0]],
	] as const) {
		const book = emptyBook();
		const purchase = newBookPurchase(book, {
			cashbackAccountId: "reward",
			cashbackAmount: amount,
			cashbackCurrency: currency,
			description: "Reward",
			installments: 1,
			purchaseDate: "2026-01-01",
			totalAmount: 3,
		});
		for (let day = 2; day <= 4; day++)
			addBookRefund(book, purchase.id, {
				amount: 1,
				creditDate: `2026-01-0${day}`,
				policy: "KEEP_INSTALLMENTS",
			});
		const rewards = creditBookRewards(book);
		expect(rewards.map(row => row.currency)).toEqual([currency, currency, currency, currency]);
		expect(rewards.map(row => row.cashbackAmount || 0)).toEqual([...expected]);
		expect(Math.abs(rewards.reduce((sum, row) => sum + row.cashbackAmount, 0))).toBeLessThan(1e-10);
	}
});

test("principal edits retain booked cashback factor and ISO denomination", () => {
	const book = emptyBook();
	const purchase = newBookPurchase(book, {
		cashbackAccountId: "reward",
		cashbackAmount: 150,
		cashbackCurrency: "JPY",
		description: "Reward",
		installments: 1,
		purchaseDate: "2026-01-01",
		totalAmount: 100,
	});
	purchase.totalAmountCents = 20000;
	resizePurchaseCashback(purchase, 10000);
	expect(purchase.cashbackAmount).toBe(300);
	expect(purchase.cashbackCurrency).toBe("JPY");
	resizePurchaseCashback(purchase, 20000);
	expect(purchase.cashbackAmount).toBe(300);
});

describe("refinancing relationships", () => {
	function family() {
		const book = emptyBook();
		const source = newBookPurchase(book, {
			description: "Wlingua",
			installments: 1,
			purchaseDate: "2026-01-01",
			tagIds: ["language"],
			totalAmount: 100,
		});
		refinanceBookPurchase(book, source.id, {
			installments: 2,
			purchaseDate: "2026-02-01",
			sourceTime: "09:10",
			time: "12:30",
			totalAmount: 120,
		});
		return { book, replacement: book.purchases[1]!, source };
	}
	test("names and tags synchronize from either side while times remain independent", () => {
		const { book, source, replacement } = family();
		let previous = structuredClone(book);
		replacement.description = "Parcelamento - Curso";
		replacement.tagIds = ["education"];
		synchronizeBookRefinancing(book, previous);
		expect(source.description).toBe("Curso");
		expect(source.tagIds).toEqual(["education"]);
		expect(source.time).toBe("09:10");
		expect(replacement.time).toBe("12:30");
		previous = structuredClone(book);
		source.description = "Idiomas";
		source.tagIds = [];
		synchronizeBookRefinancing(book, previous);
		expect(replacement.description).toBe("Parcelamento - Idiomas");
		expect(replacement.tagIds).toEqual([]);
		expect(creditBookEntries(book).find(row => row.purchaseId === replacement.id)).toMatchObject({
			description: "Parcelamento - Idiomas",
			refinancedFromPurchaseId: source.id,
		});
	});
	test("chains retain original identity and a single prefix", () => {
		const { book, source, replacement } = family();
		refinanceBookPurchase(book, replacement.id, {
			installments: 3,
			purchaseDate: "2026-03-01",
			totalAmount: 150,
		});
		const next = book.purchases[2]!;
		expect(next.description).toBe("Parcelamento - Wlingua");
		expect(bookRefinancingLinks(book).get(next.id)).toMatchObject({
			refinancedFromPurchaseId: replacement.id,
			refinancingOriginalPurchaseId: source.id,
		});
		const previous = structuredClone(book);
		next.description = "Parcelamento - Inglês";
		synchronizeBookRefinancing(book, previous);
		expect(source.description).toBe("Inglês");
		expect(replacement.description).toBe("Parcelamento - Inglês");
	});
	test("deleting the original removes chained refinancing and refunds, preserving unrelated records", () => {
		const { book, source, replacement } = family();
		refinanceBookPurchase(book, replacement.id, {
			installments: 3,
			purchaseDate: "2026-03-01",
			totalAmount: 150,
		});
		const next = book.purchases[2]!;
		addBookRefund(book, next.id, { amount: 10, creditDate: "2026-03-05" });
		const unrelated = newBookPurchase(book, {
			description: "Outra compra",
			installments: 1,
			purchaseDate: "2026-01-01",
			totalAmount: 50,
		});
		const refund = addBookRefund(book, unrelated.id, { amount: 5, creditDate: "2026-01-05" });
		const previous = structuredClone(book);
		const installmentId = book.installments.find(item => item.purchaseId === source.id)!.id;
		removeBookPurchase(book, installmentId);
		expect(book.purchases.map(item => item.id)).toEqual([unrelated.id]);
		expect(book.installments.every(item => item.purchaseId === unrelated.id)).toBe(true);
		expect(book.refunds.map(item => item.id)).toEqual([refund.id]);
		expect(new Set(book.deletedPurchaseIds)).toEqual(new Set([source.id, replacement.id, next.id]));
		expect(() => synchronizeBookRefinancing(book, previous)).not.toThrow();
		expect(creditBookEntries(book).every(item => item.purchaseId === unrelated.id)).toBe(true);
	});
	test("deleting a refinancing independently fails without mutating the book", () => {
		const { book, replacement } = family();
		const previous = structuredClone(book);
		expect(() => removeBookPurchase(book, replacement.id)).toThrow("Exclua a compra original");
		expect(book).toEqual(previous);
	});
	test("isolated deletion, detachment and moving are rejected", () => {
		const { book, source, replacement } = family();
		const deleted = structuredClone(book);
		deleted.purchases = deleted.purchases.filter(p => p.id !== replacement.id);
		expect(() => synchronizeBookRefinancing(deleted, book)).toThrow();
		const detached = structuredClone(book);
		for (const installment of detached.installments) installment.settledByPurchaseId = null;
		expect(() => synchronizeBookRefinancing(detached, book)).toThrow();
		expect(() => moveBookPurchase(book, emptyBook(), source.id)).toThrow();
	});
	test("stale metadata normalizes without guessing links from descriptions", () => {
		const { book, source, replacement } = family();
		replacement.description = "FIN Wlingua";
		replacement.tagIds = [];
		synchronizeBookRefinancing(book);
		expect(replacement.description).toBe("Parcelamento - Wlingua");
		expect(replacement.tagIds).toEqual(source.tagIds);
		const unrelated = newBookPurchase(book, {
			description: "Parcelamento - Wlingua",
			installments: 1,
			purchaseDate: "2026-03-01",
			totalAmount: 10,
		});
		expect(bookRefinancingLinks(book).get(unrelated.id)?.refinancedFromPurchaseId).toBeNull();
		book.installments.push({
			...book.installments[0]!,
			id: "second-parent",
			purchaseId: unrelated.id,
			settledByPurchaseId: replacement.id,
		});
		expect(() => bookRefinancingLinks(book)).toThrow();
	});
	test("invalid times fail before mutation", () => {
		const { book, replacement } = family();
		const previous = structuredClone(book);
		expect(() =>
			refinanceBookPurchase(book, replacement.id, {
				installments: 2,
				purchaseDate: "2026-03-01",
				time: "25:30",
				totalAmount: 100,
			}),
		).toThrow();
		expect(book).toEqual(previous);
	});
	test("cycles and conflicting edits fail explicitly", () => {
		const { book, source, replacement } = family();
		const previous = structuredClone(book);
		source.description = "A";
		replacement.description = "Parcelamento - B";
		expect(() => synchronizeBookRefinancing(book, previous)).toThrow();
		book.installments.push({
			...book.installments[0]!,
			id: "cycle",
			purchaseId: replacement.id,
			settledByPurchaseId: source.id,
		});
		expect(() => bookRefinancingLinks(book)).toThrow();
	});
});
