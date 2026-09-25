import { describe, expect, test } from "bun:test";
import { calculateFinancialAccountYieldBalances } from "./calculate-financial-account-yields";

const account = { createdAt: new Date("2026-01-01T12:00:00Z"), id: "checking", type: "CHECKING" };
const date = (value: string) => new Date(`${value}T12:00:00Z`);

function balanceAt(
	day: string,
	transactions: Array<{ amount: number; date: Date }>,
	adjustments: Array<{ balance: number; date: Date }>,
) {
	return calculateFinancialAccountYieldBalances({
		accounts: [account],
		adjustments: adjustments.map(adjustment => ({ ...adjustment, financialAccountId: account.id })),
		cashbackCredits: [],
		holidays: [],
		initialRewardsBalances: new Map(),
		today: date(day),
		transactions: transactions.map(transaction => ({
			...transaction,
			destinationFinancialAccountId: account.id,
		})),
	}).get(account.id);
}

describe("balance adjustments", () => {
	test("keeps end-of-day balance fixed when earlier transactions are imported", () => {
		const adjustments = [{ balance: 500, date: date("2026-01-10") }];
		const transactions = [{ amount: 100, date: date("2026-01-05") }];
		expect(balanceAt("2026-01-10", transactions, adjustments)).toBe(500);
		expect(
			balanceAt("2026-01-10", [...transactions, { amount: 200, date: date("2026-01-04") }], adjustments),
		).toBe(500);
		expect(balanceAt("2026-01-05", transactions, adjustments)).toBe(100);
		expect(
			balanceAt("2026-01-11", [...transactions, { amount: 30, date: date("2026-01-11") }], adjustments),
		).toBe(530);
	});

	test("later adjustments establish a new balance independently", () => {
		const adjustments = [
			{ balance: 500, date: date("2026-01-10") },
			{ balance: 700, date: date("2026-01-20") },
		];
		expect(balanceAt("2026-01-15", [{ amount: 80, date: date("2026-01-12") }], adjustments)).toBe(580);
		expect(balanceAt("2026-01-20", [{ amount: 80, date: date("2026-01-12") }], adjustments)).toBe(700);
	});
});
