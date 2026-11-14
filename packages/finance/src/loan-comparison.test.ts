import { describe, expect, test } from "bun:test";
import { shiftMonths } from "./financial-indicators";
import {
	compareLoanOffers,
	earlyPayoff,
	effectiveAnnualRate,
	type LoanComparisonOffer,
	offerCashFlows,
	pixCreditDueDates,
	type PixCreditOffer,
	solvePriceMonthlyRate,
} from "./loan-comparison";
import { buildContractSchedule, type LoanContractTerms } from "./loan-contract";

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
	rate: { fixedPeriod: "MONTHLY", fixedRate: 2 },
	startDate: "2026-01-01",
	totalInstallments: 12,
	...overrides,
});
const loan = (
	id: string,
	overrides: Partial<LoanContractTerms> = {},
	quoted?: number,
): LoanComparisonOffer => ({
	id,
	kind: "LOAN",
	name: id,
	quotedInstallment: quoted,
	terms: terms(overrides),
});
const pix = (overrides: Partial<PixCreditOffer> = {}): PixCreditOffer => ({
	amount: 10000,
	closingDay: 10,
	currency: "BRL",
	dueDay: 20,
	fee: 0,
	id: "pix",
	installments: 12,
	iof: 0,
	kind: "PIX_CREDIT",
	monthlyRate: 2,
	name: "Pix",
	pixDate: "2026-01-01",
	...overrides,
});
const cents = (value: number) => Math.round(value * 100);
const centsSum = (values: number[]) => values.reduce((sum, value) => sum + cents(value), 0);

describe("loan offers", () => {
	test.each(["PRICE", "SAC"] as const)("%s flows match the contract schedule", amortization => {
		const offer = loan("a", {
			amortization,
			charges: [
				{ amount: 300, financed: true, name: "IOF", recurring: false },
				{ amount: 15, financed: false, name: "Seguro", recurring: true },
			],
		});
		const result = offerCashFlows(offer);
		const schedule = buildContractSchedule(offer.terms);
		expect(result.status).toBe("OK");
		expect(result.flows).toEqual(
			schedule.map(row => ({
				amount: (cents(row.principal) + cents(row.interest) + cents(row.charges)) / 100,
				charges: row.charges,
				date: row.dueDate,
				interest: row.interest,
				principal: row.principal,
			})),
		);
		expect(result.received).toBe(10000);
		expect(result.financed).toBe(10300);
		expect(result.totalPaid).toBe(centsSum(result.flows.map(flow => flow.amount)) / 100);
		expect(result.totalCost).toBe((cents(result.totalPaid) - 1000000) / 100);
		expect(result.monthlyRate).toBeCloseTo(0.02, 12);
		expect(result.prepaymentDiscount).toBe(true);
	});

	test("zero-rate PRICE costs nothing", () => {
		const result = offerCashFlows(loan("zero", { rate: { fixedPeriod: "MONTHLY", fixedRate: 0 } }));
		expect(result.totalPaid).toBe(10000);
		expect(result.totalCost).toBe(0);
		expect(result.flows.every(flow => flow.interest === 0)).toBe(true);
		expect(result.cetYearly).toBeCloseTo(0, 9);
	});

	test("quoted installment solves the PRICE rate", () => {
		const reference = offerCashFlows(loan("rate"));
		const quoted = offerCashFlows(loan("quoted", {}, reference.firstInstallment));
		expect(quoted.status).toBe("OK");
		expect(quoted.monthlyRate!).toBeCloseTo(0.02, 5);
		expect(Math.abs(quoted.totalPaid - reference.totalPaid)).toBeLessThan(0.05);
	});

	test("quoted installment requires fixed PRICE", () => {
		const result = offerCashFlows(loan("sac", { amortization: "SAC" }, 1000));
		expect(result.status).toBe("INVALID");
		expect(result.reason).toContain("Price");
	});

	test("invalid terms become INVALID with the validation message", () => {
		const result = offerCashFlows(loan("bad", { principalAmount: -1 }));
		expect(result.status).toBe("INVALID");
		expect(result.reason).toBe("Valor financeiro inválido");
	});

	test("indexed rate without reference coverage is MISSING_INDICATOR", () => {
		const indexed = {
			fixedPeriod: "MONTHLY" as const,
			fixedRate: 0.5,
			indicator: "CDI" as const,
			percentage: 100,
		};
		expect(offerCashFlows(loan("cdi", { rate: indexed })).status).toBe("MISSING_INDICATOR");
		const partial = offerCashFlows(loan("cdi", { rate: indexed }), (_rule, _from, through) =>
			through <= "2026-06-01" ? 1 : null,
		);
		expect(partial.status).toBe("MISSING_INDICATOR");
		const covered = offerCashFlows(loan("cdi", { rate: indexed }), () => 1);
		expect(covered.status).toBe("OK");
		expect(covered.monthlyRate!).toBeCloseTo(1.01 * 1.005 - 1, 10);
	});
});

describe("effective annual rate", () => {
	test("1% per month over 12 months is about 12.68% per year", () => {
		const flows = Array.from({ length: 12 }, (_, index) => ({
			amount: 88.85,
			date: shiftMonths("2026-02-01", index),
		}));
		expect(effectiveAnnualRate("2026-01-01", 1000, flows)!).toBeCloseTo(0.1268, 2);
	});

	test("upfront charges raise CET above the nominal rate", () => {
		const plain = offerCashFlows(loan("plain"));
		const charged = offerCashFlows(
			loan("charged", { charges: [{ amount: 500, financed: false, name: "TAC", recurring: false }] }),
		);
		const nominal = 1.02 ** 12 - 1;
		expect(plain.cetYearly!).toBeCloseTo(nominal, 2);
		expect(charged.cetYearly!).toBeGreaterThan(plain.cetYearly! + 0.05);
		expect(charged.cetMonthly!).toBeCloseTo((1 + charged.cetYearly!) ** (1 / 12) - 1, 12);
	});

	test("returns null without outflows", () => {
		expect(effectiveAnnualRate("2026-01-01", 1000, [])).toBeNull();
	});
});

describe("implied PRICE rate", () => {
	test("round-trips the installment formula", () => {
		for (const rate of [0.005, 0.0199, 0.0499, 0.12]) {
			const installment = (5000 * rate) / (1 - (1 + rate) ** -24);
			expect(solvePriceMonthlyRate(5000, 24, installment)!).toBeCloseTo(rate, 10);
		}
	});

	test("zero rate and insufficient installments", () => {
		expect(solvePriceMonthlyRate(1200, 12, 100)).toBe(0);
		expect(solvePriceMonthlyRate(1200, 12, 99)).toBeNull();
	});
});

describe("Pix no crédito due dates", () => {
	test("Pix before closing falls on the current invoice", () => {
		expect(pixCreditDueDates("2026-03-05", 10, 20, 2)).toEqual(["2026-03-20", "2026-04-20"]);
	});

	test("Pix on or after closing moves to the next invoice", () => {
		expect(pixCreditDueDates("2026-03-10", 10, 20, 1)).toEqual(["2026-04-20"]);
		expect(pixCreditDueDates("2026-03-15", 10, 20, 1)).toEqual(["2026-04-20"]);
	});

	test("due day before closing day is due the following month", () => {
		expect(pixCreditDueDates("2026-03-05", 25, 5, 2)).toEqual(["2026-04-05", "2026-05-05"]);
	});

	test("short months clamp closing and due days", () => {
		expect(pixCreditDueDates("2026-01-30", 31, 31, 3)).toEqual([
			"2026-02-28",
			"2026-03-31",
			"2026-04-30",
		]);
		expect(pixCreditDueDates("2026-02-28", 30, 10, 1)).toEqual(["2026-04-10"]);
	});
});

describe("Pix no crédito offers", () => {
	test("rate mode amortizes the financed total including fee and IOF", () => {
		const result = offerCashFlows(pix({ fee: 200, iof: 100 }));
		expect(result.status).toBe("OK");
		expect(result.received).toBe(10000);
		expect(result.financed).toBe(10300);
		expect(result.flows[0]!.date).toBe("2026-01-20");
		expect(centsSum(result.flows.map(flow => flow.principal))).toBe(1000000);
		expect(centsSum(result.flows.map(flow => flow.charges))).toBe(30000);
		expect(result.limitCommitted).toBe(result.totalPaid);
		expect(result.prepaymentDiscount).toBe(false);
		expect(result.monthlyRate).toBe(0.02);
		expect(result.cetYearly!).toBeGreaterThan(1.02 ** 12 - 1);
	});

	test("quoted installment matches the rate mode", () => {
		const byRate = offerCashFlows(pix());
		const quoted = offerCashFlows(pix({ monthlyRate: null, quotedInstallment: byRate.firstInstallment }));
		expect(quoted.status).toBe("OK");
		expect(quoted.flows.every(flow => flow.amount === byRate.firstInstallment)).toBe(true);
		expect(quoted.monthlyRate!).toBeCloseTo(0.02, 5);
		expect(centsSum(quoted.flows.map(flow => flow.principal))).toBe(1000000);
		expect(Math.abs(quoted.cetYearly! - byRate.cetYearly!)).toBeLessThan(0.001);
	});

	test("quoted total spreads the remainder on the last installment", () => {
		const result = offerCashFlows(pix({ installments: 3, monthlyRate: null, quotedTotal: 10000.01 }));
		expect(result.flows.map(flow => flow.amount)).toEqual([3333.33, 3333.33, 3333.35]);
	});

	test("requires a rate, installment or total", () => {
		const result = offerCashFlows(pix({ monthlyRate: null }));
		expect(result.status).toBe("INVALID");
	});
});

describe("early payoff", () => {
	test("present-value discount saves interest", () => {
		const offer = loan("a");
		const result = offerCashFlows(offer);
		const payoff = earlyPayoff(offer, result, 6)!;
		const remaining = centsSum(result.flows.slice(6).map(flow => flow.amount)) / 100;
		expect(payoff.date).toBe(result.flows[5]!.date);
		expect(payoff.payoffAmount).toBeLessThan(remaining);
		expect(payoff.savings).toBeGreaterThan(0);
		expect(payoff.total).toBe((cents(payoff.paidBefore) + cents(payoff.payoffAmount)) / 100);
		expect(payoff.cetYearly!).toBeCloseTo(result.cetYearly!, 2);
	});

	test("Pix no crédito pays remaining installments without discount", () => {
		const offer = pix();
		const result = offerCashFlows(offer);
		const payoff = earlyPayoff(offer, result, 6)!;
		expect(payoff.savings).toBe(0);
		expect(payoff.total).toBe(result.totalPaid);
		expect(payoff.cetYearly!).toBeGreaterThan(result.cetYearly!);
	});

	test("out-of-range months return null", () => {
		const offer = loan("a");
		const result = offerCashFlows(offer);
		expect(earlyPayoff(offer, result, 0)).toBeNull();
		expect(earlyPayoff(offer, result, 12)).toBeNull();
	});
});

describe("comparison", () => {
	test("ranks OK offers and flags differing amounts", () => {
		const offers = [
			loan("expensive", { rate: { fixedPeriod: "MONTHLY", fixedRate: 3 } }),
			loan("cheap", { principalAmount: 8000, rate: { fixedPeriod: "MONTHLY", fixedRate: 1 } }),
			pix({ id: "pix", monthlyRate: 4.99 }),
			loan("broken", { totalInstallments: 0 }),
		];
		const comparison = compareLoanOffers(offers, { opportunityMonthlyRate: 0.01, payoffMonth: 3 });
		expect(comparison.ranking).toEqual(["cheap", "expensive", "pix"]);
		expect(comparison.amountsDiffer).toBe(true);
		expect(comparison.currencyMismatch).toBe(false);
		const cheap = comparison.results.find(result => result.id === "cheap")!;
		expect(cheap.presentValue).not.toBeNull();
		expect(cheap.netCost).toBe((cents(cheap.presentValue!) - 800000) / 100);
		expect(cheap.earlyPayoff?.month).toBe(3);
		expect(comparison.results.find(result => result.id === "broken")!.status).toBe("INVALID");
		expect(
			compareLoanOffers(offers, { opportunityMonthlyRate: 0.01, rankBy: "TOTAL_PAID" }).ranking[0],
		).toBe("cheap");
	});

	test("net cost falls back to CET without an opportunity rate; ties keep input order", () => {
		const comparison = compareLoanOffers([loan("b"), loan("a")], {
			opportunityMonthlyRate: null,
			rankBy: "NET_COST",
		});
		expect(comparison.ranking).toEqual(["b", "a"]);
		expect(comparison.amountsDiffer).toBe(false);
		expect(comparison.results[0]!.presentValue).toBeNull();
	});

	test("flags currency mismatch", () => {
		const comparison = compareLoanOffers([loan("a"), pix({ currency: "USD" })], {
			opportunityMonthlyRate: null,
		});
		expect(comparison.currencyMismatch).toBe(true);
	});
});
