import { describe, expect, test } from "bun:test";
import { createLoanContract, type LoanContractTerms } from "./loan-contract";
import {
	baselineLoanScenario,
	eligiblePlannerAccounts,
	evaluateLoanScenario,
	loanPlannerHorizon,
	type PlannerInput,
	searchLoanScenarios,
} from "./loan-planner";
const terms: LoanContractTerms = {
	amortization: "SAC",
	charges: [],
	currency: "BRL",
	discount: "PRESENT_VALUE",
	firstDueDate: "2026-02-01",
	graceInterest: "PAY",
	graceMonths: 0,
	lateFinePercent: 0,
	lateMonthlyPercent: 0,
	principalAmount: 8000,
	rate: { fixedRate: 0 },
	startDate: "2026-01-01",
	totalInstallments: 80,
};
const setup = (): PlannerInput => ({
	accounts: [{ balance: 10000, currency: "BRL", id: "cash", type: "CHECKING" }],
	currency: "BRL",
	dataIssues: [],
	eligibility: {
		accountIds: [],
		allAccounts: true,
		excludeAccountIds: [],
		includeAccountIds: [],
		includeInvestments: false,
	},
	from: "2026-01-01",
	loans: [{ book: createLoanContract("loan", "bank", terms), paymentAccountId: "cash" }],
	movements: [],
	reserve: 0,
});
describe("long-horizon loan planning", () => {
	test("80 installments keep original maturity even when paid off today", () => {
		const input = setup();
		const baseline = evaluateLoanScenario(input, baselineLoanScenario);
		const payoff = evaluateLoanScenario(
			input,
			{
				id: "payoff",
				name: "Quitar",
				operations: [
					{ accountId: "cash", input: { date: input.from, mode: "PAYOFF" }, loanId: "loan" },
				],
				transfers: [],
			},
			{},
			baseline,
		);
		expect(loanPlannerHorizon(input)).toBe("2032-09-01");
		expect(payoff.through).toBe(baseline.through);
		expect(payoff.days.length).toBeGreaterThan(2400);
		expect(payoff.status).toBe("SAFE");
		expect(payoff.advantage).toBe(0);
	});
	test("detects an intra-month deficit despite later income", () => {
		const input = setup();
		input.accounts[0]!.balance = 50;
		input.movements.push({
			amount: 10000,
			date: "2026-02-20",
			destinationAccountId: "cash",
			type: "INCOME",
		});
		const result = evaluateLoanScenario(input, baselineLoanScenario);
		expect(result.status).toBe("UNSAFE");
		expect(result.firstDeficit?.date).toBe("2026-02-01");
		expect(result.months.find(row => row.month === "2026-02")!.balance).toBeGreaterThan(0);
	});
	test("exclusion overrides explicit inclusion and category flags", () => {
		const input = setup();
		input.accounts.push({ balance: 100000, id: "savings", type: "SAVINGS" });
		expect([...eligiblePlannerAccounts(input.accounts, input.eligibility)]).toEqual(["cash"]);
		input.eligibility.includeAccountIds = ["savings"];
		expect(eligiblePlannerAccounts(input.accounts, input.eligibility).has("savings")).toBe(true);
		input.eligibility.excludeAccountIds = ["savings"];
		expect(eligiblePlannerAccounts(input.accounts, input.eligibility).has("savings")).toBe(false);
	});
	test("never uses investment balance to mask payer insolvency", () => {
		const input = setup();
		input.accounts[0]!.balance = 1;
		input.accounts.push({ balance: 100000, currency: "BRL", id: "savings", type: "SAVINGS" });
		const result = evaluateLoanScenario(input, baselineLoanScenario);
		expect(result.firstDeficit?.accountId).toBe("cash");
		expect(result.days.find(row => row.date === "2026-02-01")!.accounts.savings).toBe(100000);
	});
	test("unknown data and liquidity prevent safe verdicts", () => {
		const input = setup();
		input.dataIssues = ["Histórico incompleto"];
		expect(evaluateLoanScenario(input, baselineLoanScenario).status).toBe("UNAVAILABLE");
		input.dataIssues = [];
		input.accounts[0]!.availableFrom = "2026-03-01";
		expect(
			evaluateLoanScenario(input, {
				id: "p",
				name: "p",
				operations: [
					{ accountId: "cash", input: { date: input.from, mode: "PAYOFF" }, loanId: "loan" },
				],
				transfers: [],
			}).status,
		).toBe("UNAVAILABLE");
	});
	test("lost yield can make a zero-interest payoff worse", () => {
		const input = setup();
		input.loans[0]!.book = createLoanContract("loan", "bank", { ...terms, totalInstallments: 3 });
		const runtime = { netYield: (_account: unknown, balance: number) => balance * 0.0001 };
		const baseline = evaluateLoanScenario(input, baselineLoanScenario, runtime);
		const payoff = evaluateLoanScenario(
			input,
			{
				id: "p",
				name: "p",
				operations: [
					{ accountId: "cash", input: { date: input.from, mode: "PAYOFF" }, loanId: "loan" },
				],
				transfers: [],
			},
			runtime,
			baseline,
		);
		expect(payoff.advantage).toBeLessThan(0);
		expect(payoff.lostYield).toBeGreaterThan(0);
	});
	test("bounded search includes baseline and supports cancellation", async () => {
		const input = setup();
		input.loans[0]!.book = createLoanContract("loan", "bank", { ...terms, totalInstallments: 2 });
		const result = await searchLoanScenarios(input, { accountId: "cash", budget: 5000 });
		expect(result.ranked.some(row => row.id === "baseline")).toBe(true);
		const controller = new AbortController();
		controller.abort();
		await expect(
			searchLoanScenarios(input, { accountId: "cash", budget: 5000, signal: controller.signal }),
		).rejects.toThrow();
	});
});

test("excluding an anticipation candidate never removes its installments from the cash flow", () => {
	const input = setup();
	input.accounts[0]!.balance = 1200;
	input.loans = [
		{
			book: createLoanContract("first", "bank", {
				...terms,
				principalAmount: 1000,
				totalInstallments: 1,
			}),
			paymentAccountId: "cash",
		},
		{
			book: createLoanContract("second", "bank", {
				...terms,
				principalAmount: 1000,
				totalInstallments: 2,
			}),
			paymentAccountId: "cash",
		},
	];
	input.eligibleLoanIds = ["first"];
	const result = evaluateLoanScenario(input, baselineLoanScenario);
	expect(result.through).toBe("2026-02-01");
	expect(result.status).toBe("UNSAFE");
	expect(result.firstDeficit?.amount).toBe(-300);
});

test("automatic amortization converts the budget into contract currency", async () => {
	const input = setup();
	input.loans[0]!.book = createLoanContract("loan", "bank", {
		...terms,
		currency: "USD",
		principalAmount: 400,
		rate: { fixedRate: 2 },
		totalInstallments: 2,
	});
	const result = await searchLoanScenarios(input, {
		accountId: "cash",
		budget: 250,
		runtime: { rate: currency => (currency === "USD" ? 5 : 1) },
	});
	const amortizations = result.ranked
		.flatMap(row => row.scenario.operations)
		.filter(row => row.input.amount);
	expect(amortizations.length).toBeGreaterThan(0);
	expect(amortizations.every(row => row.input.amount! <= 50)).toBe(true);
	expect(result.ranked.every(row => row.outlay + row.costs <= 250)).toBe(true);
});

test("variable loans require current hypotheses and reprice disposable schedules", () => {
	const input = setup();
	input.loans[0]!.book = createLoanContract(
		"loan",
		"bank",
		{ ...terms, rate: { indicator: "IPCA", percentage: 100 }, totalInstallments: 2 },
		() => 0,
	);
	const original = JSON.stringify(input.loans[0]!.book);
	expect(evaluateLoanScenario(input, baselineLoanScenario).status).toBe("UNAVAILABLE");
	const current = evaluateLoanScenario(input, baselineLoanScenario, { reference: () => 2 });
	const zero = evaluateLoanScenario(input, baselineLoanScenario, { reference: () => 0 });
	expect(current.terminalWealth).toBeLessThan(zero.terminalWealth);
	expect(JSON.stringify(input.loans[0]!.book)).toBe(original);
});

test("illiquid selected assets cannot satisfy today's consolidated reserve", () => {
	const input = setup();
	input.loans[0]!.book = createLoanContract("loan", "bank", {
		...terms,
		principalAmount: 100,
		totalInstallments: 2,
	});
	input.accounts[0]!.balance = 500;
	input.accounts.push({
		availableFrom: "2026-02-01",
		balance: 10000,
		currency: "BRL",
		id: "locked",
		type: "INVESTMENT",
	});
	input.eligibility.includeAccountIds = ["locked"];
	input.reserve = 1000;
	const result = evaluateLoanScenario(input, baselineLoanScenario);
	expect(result.firstDeficit?.date).toBe(input.from);
	expect(result.status).toBe("UNSAFE");
	input.accounts[1]!.availableFrom = undefined;
	expect(evaluateLoanScenario(input, baselineLoanScenario).status).toBe("UNAVAILABLE");
});

test("variable capitalized grace is not capitalized twice during projection", () => {
	const input = setup();
	input.loans[0]!.book = createLoanContract(
		"loan",
		"bank",
		{
			...terms,
			graceInterest: "CAPITALIZE",
			graceMonths: 2,
			principalAmount: 1000,
			rate: { indicator: "IPCA", percentage: 100 },
			totalInstallments: 4,
		},
		() => 1,
	);
	const nominal = input.loans[0]!.book.versions[0]!.schedule.reduce(
		(sum, row) => sum + row.principal + row.interest + row.charges,
		0,
	);
	const result = evaluateLoanScenario(input, baselineLoanScenario, { reference: () => 1 });
	expect(result.status).toBe("SAFE");
	expect(result.days.reduce((sum, row) => sum + row.expenses, 0)).toBeCloseTo(nominal, 2);
});

test("recurring advances stop at payoff and cap the last installment quantity", () => {
	const input = setup();
	input.loans[0]!.book = createLoanContract("loan", "bank", {
		...terms,
		principalAmount: 1000,
		totalInstallments: 2,
	});
	const result = evaluateLoanScenario(input, {
		id: "repeat",
		name: "repeat",
		operations: [
			{
				accountId: "cash",
				input: { count: 3, date: input.from, mode: "FRONT" },
				loanId: "loan",
				repeatEveryMonths: 1,
				repetitions: 6,
			},
		],
		transfers: [],
	});
	expect(result.status).toBe("SAFE");
	expect(result.outlay).toBe(1000);
});

test("configured arrears cannot disappear from the safe baseline", () => {
	const input = setup();
	input.from = "2026-03-01";
	input.accounts[0]!.balance = 1030;
	input.loans[0]!.book = createLoanContract("loan", "bank", {
		...terms,
		lateFinePercent: 2,
		lateMonthlyPercent: 3,
		principalAmount: 1000,
		totalInstallments: 1,
	});
	const result = evaluateLoanScenario(input, baselineLoanScenario);
	expect(result.status).toBe("UNSAFE");
	expect(result.firstDeficit?.date).toBe(input.from);
});

test("selected installments keep their due-date identity after rescheduling", () => {
	const input = setup();
	input.loans[0]!.book = createLoanContract("loan", "bank", {
		...terms,
		principalAmount: 1000,
		rate: { fixedRate: 1 },
		totalInstallments: 3,
	});
	const chosen = input.loans[0]!.book.versions[0]!.schedule[2]!.id;
	const result = evaluateLoanScenario(input, {
		id: "selection",
		name: "selection",
		operations: [
			{
				accountId: "cash",
				input: { amount: 100, date: "2026-03-01", mode: "REDUCE_PAYMENT" },
				loanId: "loan",
			},
			{
				accountId: "cash",
				input: { date: "2026-03-02", installmentIds: [chosen], mode: "SELECTED" },
				loanId: "loan",
			},
		],
		transfers: [],
	});
	expect(result.status).toBe("SAFE");
});

test("automatic search names full settlement explicitly", async () => {
	const input = setup();
	input.loans[0]!.book = createLoanContract("loan", "bank", {
		...terms,
		principalAmount: 1000,
		rate: { fixedRate: 2 },
		totalInstallments: 3,
	});
	const result = await searchLoanScenarios(input, { accountId: "cash", budget: 2000 });
	expect(
		result.ranked.some(row =>
			row.scenario.operations.some(operation => operation.input.mode === "PAYOFF"),
		),
	).toBe(true);
});
