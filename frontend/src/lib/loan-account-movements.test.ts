import { expect, test } from "bun:test";
import { calculateFinancialAccountBalances } from "./financial-account";
import { loanAccountMovements } from "./loan-account-movements";

test("loan cash movement uses actual debit and payment date rather than original principal", () => {
	const payment = {
		accountAmount: 55,
		accountCurrency: "BRL",
		currency: "USD",
		dueDate: "2026-10-01",
		financialAccountId: "brl",
		id: "p",
		installmentNumber: 1,
		interestPaid: 1,
		isAdvanced: false,
		loanId: "l",
		paidDate: "2026-10-03",
		principalPaid: 9,
		totalPaid: 10,
	};
	expect(loanAccountMovements([payment])[0]).toMatchObject({
		amount: 55,
		currency: "BRL",
		date: "2026-10-03",
		originFinancialAccountId: "brl",
	});
	expect(loanAccountMovements([{ ...payment, paidDate: null }])).toEqual([]);
	expect(loanAccountMovements([{ ...payment, accountAmount: null, accountCurrency: null }])[0]).toMatchObject(
		{ amount: 10, currency: "USD" },
	);
});

test("actual loan debit affects balance and subsequent daily yield only from payment date", () => {
	const account = {
		balance: 0,
		createdAt: "2026-10-01",
		currency: "USD",
		id: "a",
		name: "USD",
		type: "CHECKING" as const,
		updatedAt: "2026-10-01",
		userId: "guest",
		yieldFixedRate: 10,
		yieldPeriod: "MONTHLY" as const,
	};
	const payment = {
		accountAmount: 25,
		accountCurrency: "USD",
		currency: "JPY",
		dueDate: "2026-10-01",
		financialAccountId: "a",
		id: "p",
		installmentNumber: 1,
		interestPaid: 0,
		isAdvanced: false,
		loanId: "l",
		paidDate: "2026-10-05",
		principalPaid: 3000,
		totalPaid: 3000,
	};
	const movements = [
		{ amount: 100, date: "2026-10-02", destinationFinancialAccountId: "a" },
		...loanAccountMovements([payment]),
	];
	const initial = calculateFinancialAccountBalances(
		[account],
		movements,
		[],
		[],
		new Date("2026-10-04T12:00:00"),
	)[0]!.balance!;
	const after = calculateFinancialAccountBalances(
		[account],
		movements,
		[],
		[],
		new Date("2026-10-05T12:00:00"),
	)[0]!.balance!;
	expect(initial).toBeGreaterThan(100);
	expect(after).toBeCloseTo((initial - 25) * 1.1 ** (1 / 21), 4);
});
