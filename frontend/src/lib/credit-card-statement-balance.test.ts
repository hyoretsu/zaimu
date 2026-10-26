import { describe, expect, test } from "bun:test";
import { calculateStatementBalances } from "@zaimu/finance/credit-card";
import type { CreditCardStatement } from "./api";
import {
	getCreditCardStatementDisplayAmounts,
	getCreditCardStatementDisplayBalance,
	getCreditCardStatementInvoiceAmount,
} from "./credit-card-statement-balance";

const statement = (id: string, month: string, totalAmount: number): CreditCardStatement => ({
	balanceAmount: totalAmount,
	creditCardId: "card",
	dueDate: `2026-${month}-20`,
	id,
	isPaid: false,
	paidAmount: 0,
	statementDate: `2026-${month}-15`,
	totalAmount,
});

describe("getCreditCardStatementDisplayBalance", () => {
	test("shows excess payment as negative even when credit moves to the next cycle", () => {
		const rows = calculateStatementBalances(
			[statement("aug", "08", 457.17), statement("sep", "09", 10)],
			[{ amount: 475.3, date: "2026-08-20" }],
			"2026-09-28",
		);
		expect(rows[0]!.balanceAmount).toBe(0);
		expect(getCreditCardStatementDisplayBalance(rows[0]!)).toBe(-18.13);
		expect(getCreditCardStatementDisplayBalance(rows[1]!)).toBe(-8.13);
	});

	test("keeps unpaid carried debt positive and includes prior principal and charges", () => {
		const row = {
			...statement("aug", "08", 457.17),
			amountDue: 2723.03,
			balanceAmount: 0,
			carriedInAmount: 2255.86,
			carriedOutAmount: 2247.73,
			chargesAmount: 10,
			periodPaymentAmount: 475.3,
			status: "CARRIED" as const,
		};
		expect(getCreditCardStatementDisplayBalance(row)).toBe(2247.73);
	});

	test("subtracts incoming credit and preserves exact zero after full payment", () => {
		expect(
			getCreditCardStatementDisplayBalance({
				...statement("aug", "08", 100),
				amountDue: 100,
				creditInAmount: 30,
				periodPaymentAmount: 70,
			}),
		).toBe(0);
	});

	test("uses supplied signed balance when cycle breakdown is unavailable", () => {
		expect(
			getCreditCardStatementDisplayBalance({ ...statement("aug", "08", 100), balanceAmount: -25 }),
		).toBe(-25);
	});
});

describe("invoice amount display", () => {
	test("listing uses actual closing amount while preserving projection", () => {
		const row = {
			...statement("nov", "11", 1291.26),
			actualInvoiceAmount: 822.9,
			invoiceAmount: 1291.26,
		};
		expect(getCreditCardStatementInvoiceAmount(row)).toBe(822.9);
		expect(row.invoiceAmount).toBe(1291.26);
	});
	test("uses the same net closing amount before and after the final payment", () => {
		const rows = calculateStatementBalances(
			[statement("aug", "08", 361.18), statement("sep", "09", 872.64)],
			[
				{ amount: 475.3, date: "2026-08-20" },
				{ amount: 758.52, date: "2026-09-21" },
			],
			"2026-09-22",
		);
		expect(getCreditCardStatementInvoiceAmount(rows[1]!)).toBe(758.52);
		expect(getCreditCardStatementDisplayBalance(rows[1]!)).toBe(0);
	});

	test("supports older responses without exposing the gross amount", () => {
		expect(
			getCreditCardStatementInvoiceAmount({
				...statement("sep", "09", 895.13),
				amountDue: 895.13,
				creditInAmount: 114.12,
			}),
		).toBe(781.01);
	});

	test("deducts advance payments once and preserves signed surplus", () => {
		const [row] = calculateStatementBalances(
			[statement("sep", "09", 50)],
			[{ amount: 70, date: "2026-09-10" }],
			"2026-09-22",
		);
		expect(getCreditCardStatementInvoiceAmount(row!)).toBe(-20);
		expect(getCreditCardStatementDisplayBalance(row!)).toBe(-20);
	});
});

describe("statement detail amounts", () => {
	test.each([
		["11", 940.62, 1300.76],
		["12", 475.7, 708.46],
	])("keeps %s detail equal to the tab without subtracting forecasts twice", (month, actual, projected) => {
		const row = {
			...statement("cycle", month, projected),
			actualInvoiceAmount: actual,
			invoiceAmount: projected,
		};
		const amounts = getCreditCardStatementDisplayAmounts(row);
		expect(amounts.invoiceAmount).toBe(getCreditCardStatementInvoiceAmount(row));
		expect(amounts.invoiceAmount).toBe(actual);
		expect(amounts.projectedAmount).toBe(projected);
		expect(amounts.remainingAmount).toBe(actual);
	});

	test("preserves later payments and manual totals while removing only projected balance", () => {
		const row = {
			...statement("cycle", "11", 150),
			actualInvoiceAmount: 100,
			amountDue: 150,
			invoiceAmount: 150,
			manualTotalAmount: 100,
			periodPaymentAmount: 40,
		};
		expect(getCreditCardStatementDisplayAmounts(row)).toEqual({
			invoiceAmount: 100,
			projectedAmount: 150,
			remainingAmount: 60,
		});
	});

	test("leaves nonprojected legacy balances unchanged", () => {
		expect(getCreditCardStatementDisplayAmounts(statement("cycle", "11", 100))).toEqual({
			invoiceAmount: 100,
			projectedAmount: 100,
			remainingAmount: 100,
		});
	});
});
