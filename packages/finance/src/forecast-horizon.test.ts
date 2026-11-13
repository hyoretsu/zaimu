import { expect, test } from "bun:test";
import { forecastCardPayments } from "./card-forecast";
import { type CreditBook, newBookPurchase } from "./credit-book";
import { dailyForecast } from "./daily-forecast";
import { getYieldSettings, projectedNetYield } from "./projected-yield";
import { YieldTaxLedger } from "./yield-tax";

/** Forecast horizons must stay usable up to 50 years; budgets are generous so loaded CI hosts do not flake. */
const horizonYears = 50;
const start = new Date("2026-11-09T12:00:00Z");
const dayKey = (offset: number) => new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

function yieldingForecast(days: number, compact: boolean) {
	const account = {
		balance: 5000,
		createdAt: "2020-01-01",
		id: "savings",
		type: "SAVINGS",
		yieldReferencePercentage: 100,
		yieldReferenceType: "CDI" as const,
		yieldTaxIds: ["ir"],
	};
	const movements = Array.from({ length: days }, (_, offset) => [
		{ amount: 100, date: dayKey(offset), destinationAccountId: "savings", type: "INCOME" as const },
		{ amount: 80, date: dayKey(offset), originAccountId: "savings", type: "EXPENSE" as const },
	]).flat();
	const original = YieldTaxLedger.prototype.compactMatured;
	if (!compact) YieldTaxLedger.prototype.compactMatured = () => undefined;
	try {
		return dailyForecast({
			accounts: [account as never],
			from: dayKey(0),
			movements,
			netYield: (item, balance, date, ledger) =>
				projectedNetYield(item as never, balance, date, { CDI: 0.05 }, new Set(), ledger),
			settleYield: (item, amount, date, ledger) =>
				ledger.accrueRecordedNet(amount, getYieldSettings(item as never, date), date),
			through: dayKey(days - 1),
		});
	} finally {
		YieldTaxLedger.prototype.compactMatured = original;
	}
}

test("compacting matured yield lots does not change any forecast balance", () => {
	const days = 1_600;
	const compacted = yieldingForecast(days, true);
	const reference = yieldingForecast(days, false);
	expect(compacted.length).toBe(reference.length);
	for (const [index, day] of compacted.entries()) {
		expect(day.totalBalance).toBeCloseTo(reference[index]!.totalBalance, 6);
		expect(day.income).toBeCloseTo(reference[index]!.income, 6);
	}
});

test(`daily yield forecast covers ${horizonYears} years within budget`, () => {
	const days = horizonYears * 365;
	const startedAt = performance.now();
	const result = yieldingForecast(days, true);
	expect(result).toHaveLength(days);
	expect(Number.isFinite(result.at(-1)!.totalBalance)).toBe(true);
	expect(performance.now() - startedAt).toBeLessThan(90_000);
}, 120_000);

test(`card payment forecast covers ${horizonYears} years within budget`, () => {
	const book: CreditBook = {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "user",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	// One recurring purchase per month, as the recurrence projection builds them.
	for (let month = 0; month < horizonYears * 12; month++) {
		const date = new Date(Date.UTC(2026, 10 + month, 1, 12)).toISOString().slice(0, 10);
		newBookPurchase(book, {
			description: "Plano",
			id: `p${month}`,
			installments: 1,
			purchaseDate: date,
			recurrenceId: "subscription",
			totalAmount: 50,
		});
	}
	const startedAt = performance.now();
	const payments = forecastCardPayments(book, "2026-11-09", `${2026 + horizonYears}-12-31`);
	expect(payments.length).toBeGreaterThanOrEqual(horizonYears * 12 - 1);
	expect(payments.every(payment => payment.balanceAmount === 50)).toBe(true);
	expect(performance.now() - startedAt).toBeLessThan(90_000);
}, 120_000);
