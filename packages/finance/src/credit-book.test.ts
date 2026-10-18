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
	resolveBookInstallment,
	synchronizeBookRefinancing,
	synchronizeImportedStatementDates,
	updateBookPurchaseDate,
	updateBookRefund,
	updateBookStatementDates,
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
	test("partial cancellation identifies surplus credit, retains rows and restores them on deletion", () => {
		const book = emptyBook();
		const purchase = newBookPurchase(book, {
			description: "Amazon",
			installments: 11,
			purchaseDate: "2025-04-05",
			totalAmount: 586.98,
		});
		const refund = addBookRefund(book, purchase.id, {
			amount: 237.08,
			canceledInstallmentNumbers: [8, 9, 10, 11],
		});
		expect(refund.creditDate).toBe(purchase.purchaseDate);
		const rows = creditBookEntries(book);
		expect(rows.filter(row => row.isReimbursed).map(row => row.currentInstallment)).toEqual([
			8, 9, 10, 11,
		]);
		expect(rows.find(row => row.id === refund.id)?.installmentAmount).toBe(-23.64);
		expect(
			replayCreditBook(book).statements.find(row => row.id === refund.creditStatementId)?.totalAmount,
		).toBe(29.73);
		updateBookRefund(book, purchase.id, refund.id, { amount: 213.44, creditDate: "2099-12-05" });
		expect(creditBookEntries(book).find(row => row.id === refund.id)?.installmentAmount).toBe(-0);
		expect(creditBookEntries(book).filter(row => row.isReimbursed)).toHaveLength(4);
		removeBookRefund(book, purchase.id, refund.id);
		expect(creditBookEntries(book).filter(row => row.isReimbursed)).toHaveLength(0);
	});
	test("explicit cancellation rejects overlap and values above the refund", () => {
		const book = emptyBook();
		const purchase = newBookPurchase(book, {
			description: "Compra",
			installments: 3,
			purchaseDate: "2025-01-01",
			totalAmount: 300,
		});
		addBookRefund(book, purchase.id, { amount: 100, canceledInstallmentNumbers: [3] });
		expect(() =>
			addBookRefund(structuredClone(book), purchase.id, {
				amount: 100,
				canceledInstallmentNumbers: [3],
			}),
		).toThrow("Parcela já compensada ou reembolsada");
		expect(() =>
			addBookRefund(structuredClone(book), purchase.id, {
				amount: 50,
				canceledInstallmentNumbers: [2],
			}),
		).toThrow("As parcelas selecionadas excedem");
		expect(() =>
			addBookRefund(structuredClone(book), purchase.id, {
				amount: 100,
				canceledInstallmentNumbers: [4],
			}),
		).toThrow("Seleção de parcelas inválida");
	});
	test("future refunds can be created and moved to another future invoice", () => {
		const book = emptyBook();
		const purchase = newBookPurchase(book, {
			description: "Compra",
			installments: 6,
			purchaseDate: "2025-01-01",
			totalAmount: 600,
		});
		const refund = addBookRefund(book, purchase.id, { amount: 213.44, creditDate: "2099-12-05" });
		expect(book.statements.find(item => item.id === refund.creditStatementId)?.statementDate).toBe(
			"2099-12-20",
		);
		expect(creditBookEntries(book).find(item => item.id === refund.id)?.installmentAmount).toBe(-213.44);
		const edited = updateBookRefund(book, purchase.id, refund.id, { creditDate: "2100-01-05" });
		expect(edited.id).toBe(refund.id);
		expect(book.statements.find(item => item.id === edited.creditStatementId)?.statementDate).toBe(
			"2100-01-20",
		);
		expect(creditBookEntries(book).filter(item => item.entryKind === "INSTALLMENT")).toHaveLength(6);
	});
	test("uses institution policy for new purchases without rewriting existing plans", () => {
		const book = emptyBook();
		const input = {
			description: "AliExpress",
			installments: 12,
			purchaseDate: "2026-08-10",
			totalAmount: 218.33,
		};
		const existing = newBookPurchase(book, input, undefined, { materialize: false });
		const originalPlan = [...existing.installmentAmountsCents];
		book.card.installmentRemainderOnFirst = true;
		const purchase = newBookPurchase(book, input, undefined, { materialize: false });
		const expected = [1824, ...Array<number>(11).fill(1819)];
		expect(purchase.installmentAmountsCents).toEqual(expected);
		expect(existing.installmentAmountsCents).toEqual(originalPlan);
		expect(
			creditBookPlan(book)
				.installments.filter(item => item.purchaseId === purchase.id)
				.map(item => item.amountCents),
		).toEqual(expected);
		materializeBookInstallments(book, "2027-07-10");
		expect(
			book.installments.filter(item => item.purchaseId === purchase.id).map(item => item.amountCents),
		).toEqual(expected);
	});
	test("preserves the purchase total across materialized and projected installments", () => {
		const book = emptyBook();
		const purchase = newBookPurchase(
			book,
			{
				description: "AliExpress",
				installments: 12,
				purchaseDate: "2026-08-10",
				totalAmount: 218.33,
			},
			"2026-08-10T12:00:00Z",
			{ materialize: false },
		);
		const expected = [...Array<number>(5).fill(1820), ...Array<number>(7).fill(1819)];
		expect(purchase.installmentAmountsCents).toEqual(expected);
		materializeBookInstallments(book, "2026-08-10");
		expect(book.installments.map(item => item.amountCents)).toEqual([1820]);
		expect(creditBookPlan(book).installments.map(item => item.amountCents)).toEqual(expected);
		materializeBookInstallments(book, "2027-07-10");
		expect(book.installments.map(item => item.amountCents)).toEqual(expected);
		expect(book.installments.reduce((total, item) => total + item.amountCents, 0)).toBe(21833);
		expect(
			creditBookEntries(book)
				.filter(entry => entry.purchaseId === purchase.id)
				.map(entry => Math.round(entry.installmentAmount * 100)),
		).toEqual(expected);
	});
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
	test("inclusive closing reuses the current invoice for materialized and projected installments", () => {
		const book = emptyBook();
		book.card.statementClosingInclusive = true;
		const current = ensureBookStatement(book, "2025-01-19");
		const purchase = newBookPurchase(
			book,
			{
				description: "Compra no fechamento",
				installments: 2,
				purchaseDate: "2025-01-20",
				totalAmount: 100,
			},
			"2025-01-20T12:00:00Z",
		);
		expect(book.installments.find(item => item.purchaseId === purchase.id)?.statementId).toBe(current.id);
		const plan = creditBookPlan(book);
		expect(
			plan.installments.map(
				item => plan.statements.find(s => s.id === item.statementId)?.statementDate,
			),
		).toEqual(["2025-01-20", "2025-02-20"]);
	});
	test.each([false, true])(
		"effective closing dates control explicit recalculation and refunds (%j)",
		inclusive => {
			const book = emptyBook();
			book.card.statementClosingInclusive = inclusive;
			const current = ensureBookStatement(book, "2025-01-19");
			const purchase = newBookPurchase(
				book,
				{
					description: "Fechamento alterado",
					installments: 2,
					purchaseDate: "2025-01-22",
					totalAmount: 100,
				},
				"2025-01-22T12:00:00Z",
			);
			updateBookStatementDates(book, current.id, {
				dueDate: "2025-01-28",
				statementDate: "2025-01-22",
			});
			const plan = creditBookPlan(book);
			const first = plan.installments.find(
				item => item.purchaseId === purchase.id && item.number === 1,
			)!;
			expect(plan.statements.find(item => item.id === first.statementId)?.statementDate).toBe(
				inclusive ? "2025-01-22" : "2025-02-20",
			);
			const refund = addBookRefund(book, purchase.id, { amount: 10, creditDate: "2025-01-22" });
			expect(book.statements.find(item => item.id === refund.creditStatementId)?.statementDate).toBe(
				inclusive ? "2025-01-22" : "2025-02-20",
			);
		},
	);
	test.each([false, true])(
		"new purchases honor moved effective cutoff rather than nominal cutoff (%j)",
		inclusive => {
			const book = emptyBook();
			book.card.statementClosingInclusive = inclusive;
			const current = ensureBookStatement(book, "2025-01-19");
			updateBookStatementDates(book, current.id, {
				dueDate: "2025-01-28",
				statementDate: "2025-01-22",
			});
			for (const day of [21, 22, 23]) {
				const purchase = newBookPurchase(
					book,
					{
						description: "Limite efetivo",
						installments: 1,
						purchaseDate: `2025-01-${day}`,
						totalAmount: 10,
					},
					"2025-01-23T12:00:00Z",
				);
				const installment = book.installments.find(item => item.purchaseId === purchase.id)!;
				expect(book.statements.find(item => item.id === installment.statementId)?.statementDate).toBe(
					day < 22 || (day === 22 && inclusive) ? "2025-01-22" : "2025-02-20",
				);
			}
		},
	);
	test("changing institution policy preserves materialized installment history", () => {
		const book = emptyBook();
		const purchase = newBookPurchase(
			book,
			{
				description: "Histórico",
				installments: 2,
				purchaseDate: "2025-01-20",
				totalAmount: 100,
			},
			"2025-01-20T12:00:00Z",
		);
		const original = structuredClone(book.installments);
		book.card.statementClosingInclusive = true;
		const plan = creditBookPlan(book);
		expect(book.installments).toEqual(original);
		const first = plan.installments.find(item => item.purchaseId === purchase.id && item.number === 1)!;
		expect(first.statementId).toBe(original[0]!.statementId);
		expect(plan.statements.find(item => item.id === first.statementId)?.statementDate).toBe("2025-02-20");
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
		expect(
			creditBookEntries(book).filter(row => row.entryKind === "INSTALLMENT" && !row.isReimbursed),
		).toHaveLength(1);
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
	test("refinancing a refinancing fails without mutation", () => {
		const { book, replacement } = family();
		const previous = structuredClone(book);
		expect(() =>
			refinanceBookPurchase(book, replacement.id, {
				installments: 3,
				purchaseDate: "2026-03-01",
				totalAmount: 150,
			}),
		).toThrow("Não é possível reparcelar um reparcelamento");
		expect(book).toEqual(previous);
	});
	test("deleting the original removes chained refinancing and refunds, preserving unrelated records", () => {
		const { book, source, replacement } = family();
		newBookPurchase(book, {
			description: "Parcelamento - Wlingua",
			installments: 3,
			purchaseDate: "2026-03-01",
			totalAmount: 150,
		});
		const next = book.purchases[2]!;
		for (const item of book.installments.filter(i => i.purchaseId === replacement.id)) {
			item.isSettled = true;
			item.settledByPurchaseId = next.id;
		}
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
	test("deleting a refinancing restores original installments and keeps its purchase", () => {
		const { book, source, replacement } = family();
		const previous = structuredClone(book);
		removeBookPurchase(book, replacement.id);
		expect(book.purchases.map(p => p.id)).toEqual([source.id]);
		expect(
			book.installments
				.filter(i => i.purchaseId === source.id)
				.every(i => !i.settledByPurchaseId && !i.isSettled),
		).toBe(true);
		expect(book.deletedPurchaseIds).toContain(replacement.id);
		expect(() => synchronizeBookRefinancing(book, previous)).not.toThrow();
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

test("forecast installment IDs resolve only existing purchase plan entries", () => {
	const book = emptyBook();
	const purchase = newBookPurchase(book, {
		description: "AliExpress",
		installments: 12,
		purchaseDate: "2026-08-13",
		totalAmount: 140.22,
	});
	expect(resolveBookInstallment(book, `forecast-${purchase.id}-7`)).toEqual({
		number: 7,
		purchaseId: purchase.id,
	});
	expect(resolveBookInstallment(book, `forecast-${purchase.id}-13`)).toBeUndefined();
	expect(resolveBookInstallment(book, "forecast-missing-7")).toBeUndefined();
	const before = [...purchase.installmentAmountsCents];
	const installment = resolveBookInstallment(book, `forecast-${purchase.id}-7`)!;
	const amounts = [...purchase.installmentAmountsCents];
	amounts[installment.number - 1] = 1169;
	purchase.installmentAmountsCents = amounts;
	purchase.totalAmountCents = purchase.installmentAmountsCents.reduce((sum, amount) => sum + amount, 0);
	expect(
		creditBookEntries(book).find(row => row.id === `forecast-${purchase.id}-7`)?.installmentAmount,
	).toBe(11.69);
	expect(purchase.installmentAmountsCents.filter((_, index) => index !== 6)).toEqual(
		before.filter((_, index) => index !== 6),
	);
});

describe("imported statement date synchronization", () => {
	test("corrects both dates while preserving cycle ID and installment assignments", () => {
		const book = emptyBook();
		const statement = ensureBookStatement(book, "2026-09-10");
		const purchase = newBookPurchase(book, {
			description: "Compra",
			installments: 1,
			purchaseDate: "2026-09-10",
			totalAmount: 100,
		});
		materializeBookInstallments(book);
		const installment = book.installments[0]!;
		purchase.installmentStatementDates = [
			{ dueDate: statement.dueDate, statementDate: statement.statementDate },
		];
		const result = synchronizeImportedStatementDates(book, {
			dueDate: "2026-09-30",
			statementDate: "2026-09-22",
		});
		expect(result.id).toBe(statement.id);
		expect(book.statements).toHaveLength(1);
		expect(installment.statementId).toBe(statement.id);
		expect(purchase.installmentStatementDates[0]).toEqual({
			dueDate: "2026-09-30",
			statementDate: "2026-09-22",
		});
		expect(book.card.statementDay).toBe(20);
		expect(book.card.dueDay).toBe(28);
	});
	test("matches due date when corrected closing crosses a month", () => {
		const book = emptyBook();
		const existing = ensureBookStatement(book, "2026-09-10", {
			dueDate: "2026-10-10",
			statementDate: "2026-09-30",
		});
		expect(
			synchronizeImportedStatementDates(book, { dueDate: "2026-10-10", statementDate: "2026-10-01" })
				.id,
		).toBe(existing.id);
		expect(book.statements).toHaveLength(1);
	});
	test("rejects invalid bank calendar before mutation", () => {
		const book = emptyBook();
		expect(() =>
			synchronizeImportedStatementDates(book, { dueDate: "2026-10-10", statementDate: "2026-10-20" }),
		).toThrow();
		expect(book.statements).toHaveLength(0);
	});
});
