import { describe, expect, test } from "bun:test";
import { shiftMonths } from "./financial-indicators";
import {
	activeLoanVersion,
	applyLoanSimulation,
	buildContractSchedule,
	createLoanContract,
	loanContractSummary,
	type LoanContractTerms,
	loanScheduleTotal,
	outstandingLoanSchedule,
	recordLoanPayment,
	reverseLoanReceipt,
	simulateLoanOperation,
} from "./loan-contract";
const terms = (overrides: Partial<LoanContractTerms> = {}): LoanContractTerms => ({
	amortization: "PRICE",
	charges: [],
	currency: "BRL",
	discount: "PRESENT_VALUE",
	firstDueDate: "2026-02-01",
	graceInterest: "CAPITALIZE",
	graceMonths: 0,
	lateFinePercent: 0,
	lateMonthlyPercent: 0,
	principalAmount: 10000,
	rate: { fixedPeriod: "MONTHLY", fixedRate: 1 },
	startDate: "2026-01-01",
	totalInstallments: 12,
	...overrides,
});
const payment = { accountAmount: 100, accountCurrency: "BRL", accountId: "account", id: "p1" };
describe("versioned loan contract", () => {
	test.each(["PRICE", "SAC"] as const)("%s conserves principal and reaches zero", amortization => {
		const rows = buildContractSchedule(terms({ amortization, firstDueDate: "2026-01-31" }));
		expect(rows.reduce((sum, row) => sum + Math.round(row.principal * 100), 0)).toBe(1000000);
		expect(rows.at(-1)!.balance).toBe(0);
		expect(rows[1]!.dueDate).toBe("2026-02-28");
		expect(rows[2]!.dueDate).toBe("2026-03-31");
	});
	test("zero rate and capitalized grace", () => {
		const zero = buildContractSchedule(
			terms({ principalAmount: 100, rate: { fixedRate: 0 }, totalInstallments: 3 }),
		);
		expect(loanScheduleTotal(zero, "BRL")).toBe(100);
		const grace = buildContractSchedule(terms({ graceMonths: 2 }));
		expect(grace[0]!.principal).toBe(0);
		expect(grace[0]!.interest).toBe(0);
		expect(grace[1]!.balance).toBe(10201);
		expect(grace.at(-1)!.balance).toBe(0);
	});
	test("manual principal mismatch rejected", () => {
		expect(() =>
			buildContractSchedule(
				terms({
					amortization: "MANUAL",
					manualSchedule: [{ charges: 0, dueDate: "2026-02-01", interest: 5, principal: 90 }],
					totalInstallments: 1,
				}),
			),
		).toThrow();
	});
	test("partial payments preserve immutable versions and can be reversed", () => {
		const book = createLoanContract("loan", "bank", terms());
		const original = JSON.stringify(book);
		const next = recordLoanPayment(book, {
			...payment,
			amount: 150,
			date: "2026-02-01",
			expectedRevision: 1,
		});
		expect(JSON.stringify(book)).toBe(original);
		expect(next.receipts[0]!.allocations[0]!.interest).toBe(100);
		expect(next.receipts[0]!.allocations[0]!.principal).toBe(50);
		expect(loanScheduleTotal(outstandingLoanSchedule(next), "BRL")).toBeCloseTo(
			loanScheduleTotal(outstandingLoanSchedule(book), "BRL") - 150,
		);
		const restored = reverseLoanReceipt(next, "p1", "r1", "2026-02-02", 2);
		expect(loanScheduleTotal(outstandingLoanSchedule(restored), "BRL")).toBe(
			loanScheduleTotal(outstandingLoanSchedule(book), "BRL"),
		);
	});
	test("selected anticipation discounts real debit and protects stale previews", () => {
		const book = createLoanContract("loan", "bank", terms());
		const simulation = simulateLoanOperation(book, { count: 2, date: "2026-01-10", mode: "BACK" });
		expect(simulation.discount).toBeGreaterThan(0);
		const next = applyLoanSimulation(book, simulation, payment);
		expect(outstandingLoanSchedule(next)).toHaveLength(10);
		expect(next.receipts[0]!.amount).toBe(simulation.amount);
		expect(() => applyLoanSimulation(next, simulation, { ...payment, id: "p2" })).toThrow();
	});
	test.each(["REDUCE_TERM", "REDUCE_PAYMENT"] as const)(
		"%s recalculates only outstanding principal",
		mode => {
			const book = createLoanContract("loan", "bank", terms());
			const simulation = simulateLoanOperation(book, { amount: 5000, date: "2026-01-15", mode });
			expect(simulation.schedule.reduce((sum, row) => sum + Math.round(row.principal * 100), 0)).toBe(
				500000,
			);
			expect(simulation.interestSaved).toBeGreaterThan(0);
			if (mode === "REDUCE_TERM") expect(simulation.schedule.length).toBeLessThan(12);
		},
	);
	test("missing reference blocks calculation rather than treating rate as zero", () => {
		expect(() =>
			createLoanContract("l", "b", terms({ rate: { indicator: "IPCA", percentage: 100 } })),
		).toThrow();
		const book = createLoanContract(
			"l",
			"b",
			terms({ rate: { indicator: "IPCA", percentage: 100 } }),
			() => -0.1,
		);
		expect(activeLoanVersion(book).schedule[0]!.interest).toBeLessThan(0);
	});
});

test("serialized quote key order does not invalidate an equivalent preview", () => {
	const book = createLoanContract("loan", "bank", terms());
	const quote = simulateLoanOperation(book, { count: 1, date: "2026-01-10", mode: "BACK" });
	const reorder = (value: unknown): unknown =>
		Array.isArray(value)
			? value.map(reorder)
			: value && typeof value === "object"
				? Object.fromEntries(
						Object.entries(value)
							.reverse()
							.map(([key, item]) => [key, reorder(item)]),
					)
				: value;
	const roundTrip = reorder(quote) as typeof quote;
	expect(applyLoanSimulation(book, roundTrip, payment).revision).toBe(2);
});

test("partial late payments charge the fine once and accrue only the new interval", () => {
	const book = createLoanContract(
		"loan",
		"bank",
		terms({
			lateFinePercent: 2,
			lateMonthlyPercent: 3,
			principalAmount: 1000,
			rate: { fixedRate: 0 },
			totalInstallments: 1,
		}),
	);
	const date = shiftMonths(activeLoanVersion(book).schedule[0]!.dueDate, 1);
	const first = recordLoanPayment(book, { ...payment, amount: 550, date, expectedRevision: 1 });
	const next = recordLoanPayment(first, {
		...payment,
		amount: 100,
		date,
		expectedRevision: first.revision,
		id: "second-partial",
	});
	expect(first.receipts.at(-1)!.lateCharges).toBeGreaterThan(0);
	expect(next.receipts.at(-1)!.lateCharges).toBe(0);
});

test("sequential reversals restore earlier snapshots without losing audit receipts", () => {
	const original = createLoanContract("loan", "bank", terms());
	const first = recordLoanPayment(original, {
		...payment,
		amount: 100,
		date: "2026-02-01",
		expectedRevision: 1,
		id: "one",
	});
	const second = recordLoanPayment(first, {
		...payment,
		amount: 100,
		date: "2026-02-01",
		expectedRevision: 2,
		id: "two",
	});
	const reversedSecond = reverseLoanReceipt(second, "two", "reverse-two", "2026-02-01", 3);
	const reversedFirst = reverseLoanReceipt(reversedSecond, "one", "reverse-one", "2026-02-01", 4);
	expect(loanScheduleTotal(outstandingLoanSchedule(reversedFirst), "BRL")).toBe(
		loanScheduleTotal(outstandingLoanSchedule(original), "BRL"),
	);
	expect(reversedFirst.receipts).toHaveLength(4);
	expect(reversedFirst.receipts.reduce((sum, row) => sum + row.amount, 0)).toBe(0);
});

test("summary counts completed installments rather than partial receipts", () => {
	const book = createLoanContract("loan", "bank", terms());
	const first = recordLoanPayment(book, {
		...payment,
		amount: 10,
		date: "2026-02-01",
		expectedRevision: 1,
		id: "p1",
	});
	const second = recordLoanPayment(first, {
		...payment,
		amount: 10,
		date: "2026-02-01",
		expectedRevision: 2,
		id: "p2",
	});
	expect(loanContractSummary(second).paidInstallments).toBe(0);
	expect(loanContractSummary(second).remainingInstallments).toBe(12);
	expect(loanContractSummary(second).totalPaid).toBe(20);
});

test("payoff includes configured arrears and audits their amount", () => {
	const book = createLoanContract(
		"loan",
		"bank",
		terms({
			lateFinePercent: 2,
			lateMonthlyPercent: 3,
			principalAmount: 1000,
			rate: { fixedRate: 0 },
			totalInstallments: 1,
		}),
	);
	const quote = simulateLoanOperation(book, { date: "2026-03-01", mode: "PAYOFF" });
	expect(quote.amount).toBe(1048);
	expect(quote.charges).toBe(48);
	const paid = applyLoanSimulation(book, quote, payment);
	expect(paid.receipts.at(-1)!.lateCharges).toBe(48);
});

test("principal amortization respects accrued interest and cannot bypass payoff charges", () => {
	const book = createLoanContract(
		"loan",
		"bank",
		terms({
			charges: [{ amount: 30, financed: false, name: "Tarifa", recurring: false }],
			principalAmount: 1000,
			totalInstallments: 3,
		}),
	);
	const partial = simulateLoanOperation(book, { amount: 500, date: "2026-02-01", mode: "REDUCE_PAYMENT" });
	expect(partial.amount).toBe(505);
	expect(partial.schedule[0]!.charges).toBe(30);
	const full = simulateLoanOperation(book, { amount: 1000, date: "2026-01-01", mode: "REDUCE_TERM" });
	expect(full.amount).toBe(simulateLoanOperation(book, { date: "2026-01-01", mode: "PAYOFF" }).amount);
});
