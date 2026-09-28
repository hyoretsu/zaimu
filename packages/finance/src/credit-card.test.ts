import { describe, expect, test } from "bun:test";
import {
	calculateStatementBalances,
	paymentStatementDates,
	statementCharges,
	statementCycles,
	statementEntryKind,
} from "./credit-card";

const calendar = { dueDay: 25, statementDay: 15 };
const invoice = (month: string, totalAmount: number, chargesAmount = 0) => ({
	chargesAmount,
	dueDate: `2024-${month}-25`,
	id: month,
	paidAmount: 999,
	statementDate: `2024-${month}-15`,
	totalAmount,
});

describe("due-date card ledger", () => {
	test("selects the due date inclusively rather than the purchase closing cycle", () => {
		expect(paymentStatementDates(calendar, "2024-08-20")).toEqual({
			dueDate: "2024-08-25",
			statementDate: "2024-08-15",
		});
		expect(paymentStatementDates(calendar, "2024-08-25").dueDate).toBe("2024-08-25");
		expect(paymentStatementDates(calendar, "2024-08-26").dueDate).toBe("2024-09-25");
		expect(paymentStatementDates({ dueDay: 3, statementDay: 25 }, "2024-01-03")).toEqual({
			dueDate: "2024-01-03",
			statementDate: "2023-12-25",
		});
		expect(paymentStatementDates({ dueDay: 31, statementDay: 31 }, "2024-02-29")).toEqual({
			dueDate: "2024-02-29",
			statementDate: "2024-01-31",
		});
	});
	test("keeps exact, partial and surplus payments in their historical cycle", () => {
		const rows = [invoice("08", 100), invoice("09", 80)];
		expect(
			calculateStatementBalances(rows, [{ amount: 40, date: "2024-08-25" }], "2024-08-25")[0],
		).toMatchObject({ balanceAmount: 60, carriedOutAmount: 0, isPaid: false });
		expect(
			calculateStatementBalances(rows, [{ amount: 100, date: "2024-08-25" }], "2024-08-25")[0],
		).toMatchObject({ balanceAmount: 0, isPaid: true });
		const surplus = calculateStatementBalances(rows, [{ amount: 200, date: "2024-08-20" }], "2024-08-25");
		expect(surplus.map(s => s.balanceAmount)).toEqual([0, -20]);
		expect(surplus[1]).toMatchObject({ creditInAmount: 100, paidAmount: 80 });
	});
	test("transfers debt after the due date and never marks its source paid", () => {
		const result = calculateStatementBalances(
			[invoice("08", 100), invoice("09", 80, 12)],
			[
				{ amount: 40, date: "2024-08-25" },
				{ amount: 152, date: "2024-09-25" },
			],
			"2024-09-25",
		);
		expect(result[0]).toMatchObject({
			balanceAmount: 0,
			carriedOutAmount: 60,
			isPaid: false,
			paidAmount: 40,
			status: "CARRIED",
			totalAmount: 100,
		});
		expect(result[1]).toMatchObject({
			amountDue: 152,
			balanceAmount: 0,
			carriedInAmount: 60,
			chargesAmount: 12,
			status: "PAID",
		});
	});
	test("later payments do not rewrite earlier quitation snapshots or affect historical queries", () => {
		const rows = [invoice("08", 100), invoice("09", 80), invoice("10", 20)];
		const payments = [
			{ amount: 180, date: "2024-09-25" },
			{ amount: 20, date: "2026-09-25" },
		];
		const result = calculateStatementBalances(rows, payments, "2024-09-25");
		expect(result[0]).toMatchObject({ carriedOutAmount: 100, paidAmount: 0, status: "CARRIED" });
		expect(result[1]).toMatchObject({ amountDue: 180, paidAmount: 180, status: "PAID" });
		expect(result[2].balanceAmount).toBe(20);
	});
	test("fills unpaid months without double-counting principal in the limit", () => {
		const cycles = statementCycles(
			[invoice("08", 100)],
			calendar,
			[],
			d => ({ ...invoice("00", 0), id: d.dueDate, ...d }),
			"2024-11-26",
		);
		const result = calculateStatementBalances(cycles, [], "2024-11-26");
		expect(result.filter(s => s.status === "CARRIED")).toHaveLength(4);
		expect(result.reduce((sum, s) => sum + s.balanceAmount, 0)).toBe(100);
		expect(result.at(-1)).toMatchObject({ carriedInAmount: 100, dueDate: "2024-12-25" });
	});
	test("replays edits, refunds and deletion deterministically regardless of input order", () => {
		const rows = [invoice("08", 100), invoice("09", -20), invoice("10", 80)];
		const payments = [
			{ amount: 40, date: "2024-08-20" },
			{ amount: 120, date: "2024-10-25" },
		];
		const result = calculateStatementBalances(rows, payments, "2024-10-25");
		const reordered = calculateStatementBalances(rows.toReversed(), payments.toReversed(), "2024-10-25");
		expect(reordered.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(result);
		expect(result.reduce((sum, s) => sum + s.balanceAmount, 0)).toBe(0);
		expect(calculateStatementBalances(rows, [], "2024-10-25").at(-1)?.balanceAmount).toBe(160);
		expect(
			calculateStatementBalances(
				[{ ...rows[0]!, totalAmount: 110 }, ...rows.slice(1)],
				payments,
				"2024-10-25",
			).at(-1)?.balanceAmount,
		).toBe(10);
	});
	test("respects actual imported due dates", () => {
		const rows = [{ ...invoice("08", 100), dueDate: "2024-08-28" }, invoice("09", 80)];
		expect(
			calculateStatementBalances(rows, [{ amount: 100, date: "2024-08-27" }], "2024-08-28")[0]?.status,
		).toBe("PAID");
	});
	test("distinguishes real charges, principal summaries, purchases and refunds", () => {
		expect(statementEntryKind("JUROS DE MORA")).toBe("CHARGE");
		expect(statementEntryKind("IOF ROTATIVO")).toBe("CHARGE");
		expect(statementEntryKind("Saldo anterior")).toBe("BALANCE");
		expect(statementEntryKind("PAGAMENTO DE FATURA")).toBe("BALANCE");
		expect(statementEntryKind("IOFONE LOJA")).toBe("PURCHASE");
		expect(statementEntryKind("MORAES SUPERMERCADO")).toBe("PURCHASE");
		expect(statementEntryKind("ESTORNO LOJA")).toBe("PURCHASE");
	});
});

test("separates informed refinancing costs with exact cents and no new interest estimates", () => {
	const purchases = [
		{
			currentInstallment: 1,
			id: "root",
			installmentAmount: 33.33,
			refinancingFeeAmount: 10,
			statementId: "august",
		},
		{
			currentInstallment: 2,
			id: "child",
			installmentAmount: 76.67,
			parentId: "root",
			statementId: "september",
		},
		{
			feeAmount: 2.12,
			feeDescription: "IOF do parcelamento",
			id: "iof",
			installmentAmount: 50,
			statementId: "september",
		},
		{
			feeAmount: 5,
			feeDescription: "Taxa da compra",
			id: "ordinary",
			installmentAmount: 20,
			statementId: "august",
		},
		{
			id: "settled",
			installmentAmount: 100,
			isSettled: true,
			isStatementCharge: true,
			statementId: "august",
		},
	];
	expect([...statementCharges(purchases)]).toEqual([
		["august", 303],
		["september", 909],
	]);
	expect([...statementCharges(purchases.toReversed())].toSorted()).toEqual(
		[...statementCharges(purchases)].toSorted(),
	);
});
