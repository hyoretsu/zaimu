import { describe, expect, test } from "bun:test";
import { applyStatementCredits } from "./statement-balance";

const invoice = (month: string, totalAmount: number) => ({
	dueDate: `2024-${month}-25`,
	id: month,
	statementDate: `2024-${month}-15`,
	totalAmount,
});

describe("statement balances", () => {
	test("assigns payment after closing but before due to the same invoice", () => {
		const result = applyStatementCredits(
			[invoice("08", 100), invoice("09", 80)],
			[{ amount: 100, date: "2024-08-20" }],
			"2024-08-25",
		);
		expect(result[0]).toMatchObject({ isPaid: true, paidAmount: 100, periodPaymentAmount: 100 });
		expect(result[1].periodPaymentAmount).toBe(0);
	});
	test("rolls partial overdue principal forward without retroactively settling source", () => {
		const rows = [invoice("07", 120), invoice("08", 80), invoice("09", 100)];
		const payments = [{ amount: 250, date: "2024-08-25" }];
		const result = applyStatementCredits(rows, payments, "2024-09-25");
		expect(result[0]).toMatchObject({
			carriedOutAmount: 120,
			isPaid: false,
			paidAmount: 0,
			status: "CARRIED",
		});
		expect(result[1]).toMatchObject({ isPaid: true, paidAmount: 200, periodPaymentAmount: 250 });
		expect(result[2]).toMatchObject({ balanceAmount: 50, creditInAmount: 50, periodPaymentAmount: 0 });
	});
	test("replays deletion and late historical purchase edits", () => {
		const rows = [invoice("07", 100), invoice("08", 80)];
		const payments = [{ amount: 180, date: "2024-08-25" }];
		expect(applyStatementCredits(rows, payments, "2024-08-25")[1].isPaid).toBe(true);
		expect(applyStatementCredits(rows, [], "2024-08-25")[1].balanceAmount).toBe(180);
		expect(
			applyStatementCredits([invoice("07", 150), rows[1]!], payments, "2024-08-25")[1].balanceAmount,
		).toBe(50);
	});
});
