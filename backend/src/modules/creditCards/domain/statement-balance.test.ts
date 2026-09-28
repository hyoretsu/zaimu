import { describe, expect, test } from "bun:test";
import { applyStatementCredits } from "./statement-balance";

const statement = (id: string, month: number, totalAmount: number, paidAmount: number) => ({
	id,
	isPaid: false,
	paidAmount: String(paidAmount),
	statementDate: new Date(Date.UTC(2026, month - 1, 15)),
	totalAmount: String(totalAmount),
});

describe("applyStatementCredits", () => {
	test("closes a fully paid statement before its closing date", () => {
		expect(applyStatementCredits([statement("current", 12, 333.15, 333.15)]).at(0)).toMatchObject({
			balanceAmount: 0,
			isPaid: true,
		});
	});

	test("keeps a partially paid statement open", () => {
		expect(applyStatementCredits([statement("current", 12, 333.15, 114.12)]).at(0)).toMatchObject({
			balanceAmount: 219.03,
			isPaid: false,
		});
	});

	test("uses excess payments on following statements", () => {
		const result = applyStatementCredits([statement("next", 12, 100, 0), statement("current", 11, 100, 250)]);
		expect(result).toEqual([
			expect.objectContaining({ balanceAmount: -50, id: "next", isPaid: true }),
			expect.objectContaining({ balanceAmount: 0, id: "current", isPaid: true }),
		]);
	});
});
