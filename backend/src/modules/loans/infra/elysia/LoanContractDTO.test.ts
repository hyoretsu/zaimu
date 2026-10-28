import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
	createLoanContract,
	type LoanContractTerms,
	simulateLoanOperation,
} from "@zaimu/finance/loan-contract";
import Elysia from "elysia";
import { LoanContractBookDTO, LoanSimulationInputDTO, LoanSimulationReturn } from "./LoanContractDTO";
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
	principalAmount: 1000,
	rate: { fixedPeriod: "MONTHLY", fixedRate: 1 },
	startDate: "2026-01-01",
	totalInstallments: 12,
};
test("serialized versioned contracts and quotes retain numeric financial fields", async () => {
	const book = createLoanContract("loan", "bank", terms);
	const simulation = simulateLoanOperation(book, { count: 3, date: "2026-01-10", mode: "BACK" });
	const app = new Elysia()
		.get("/book", () => JSON.parse(JSON.stringify(book)), { response: LoanContractBookDTO })
		.get("/quote", () => JSON.parse(JSON.stringify(simulation)), { response: LoanSimulationReturn });
	for (const path of ["book", "quote"]) {
		const response = await app.handle(new Request(`http://localhost/${path}`));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(path === "book" ? book : simulation);
	}
});
test("simulation boundary rejects fractional counts and unsupported operations", () => {
	expect(Value.Check(LoanSimulationInputDTO, { count: 1.5, date: "2026-01-10", mode: "BACK" })).toBe(false);
	expect(Value.Check(LoanSimulationInputDTO, { date: "2026-01-10", mode: "DELETE_ALL" })).toBe(false);
	expect(
		Value.Check(LoanContractBookDTO, {
			institutionId: null,
			loanId: "l",
			receipts: [],
			revision: 0,
			versions: [],
		}),
	).toBe(false);
});
