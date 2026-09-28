import { describe, expect, test } from "bun:test";
import { calculateStatementBalances } from "@zaimu/finance/credit-card";
import type { CreditCardStatement } from "./api";
import { getCreditCardStatementDisplayBalance } from "./credit-card-statement-balance";

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
		expect(getCreditCardStatementDisplayBalance({ ...statement("aug", "08", 100), balanceAmount: -25 })).toBe(
			-25,
		);
	});
});
