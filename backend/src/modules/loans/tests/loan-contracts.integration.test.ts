import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	applyLoanSimulation,
	type LoanContractTerms,
	recordLoanPayment,
	restructureLoanContract,
	simulateLoanOperation,
} from "@zaimu/finance/loan-contract";
import { Client } from "pg";
import { closeDatabase, queryRaw, withRawTransaction } from "sql";
import contract from "../../../../../packages/sql/migrations/snapshots/6af0e52f81411b29960d995cd65365f2fb0d92995e7d15957dfbbb3a78ec0cbe/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { insertLoanBook, loadLoanBook, saveLoanBook } from "../application/loan-contracts";
const url = requireFixtureUrl("DATABASE_TEST_URL");
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
	rate: { fixedRate: 1 },
	startDate: "2026-01-01",
	totalInstallments: 10,
};
describe("versioned loan persistence and compatibility ledger", () => {
	beforeAll(async () => {
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await installContractFixture(client, contract);
		} finally {
			await client.end();
		}
		await queryRaw(
			`INSERT INTO "user" ("id","email","name","role") VALUES ('owner','loan-owner@test.invalid','Owner','USER'),('other','loan-other@test.invalid','Other','USER')`,
		);
		await queryRaw(
			`INSERT INTO "FinancialInstitution" ("id","name","normalizedName","currency","status","operatingCountryCodes","updatedAt") VALUES ('bank','Bank','bank','BRL','APPROVED',ARRAY['BR'],NOW())`,
		);
	});
	afterAll(() => closeDatabase());
	test("partial payments serialize; stale tabs cannot double debit; rollback preserves projections", async () => {
		const original = await withRawTransaction(() => insertLoanBook("owner", "bank", terms));
		await expect(loadLoanBook("other", original.loanId)).rejects.toThrow();
		const results = await Promise.allSettled(
			[1, 2].map(index =>
				withRawTransaction(async () => {
					const book = await loadLoanBook("owner", original.loanId, true);
					const next = recordLoanPayment(book, {
						accountAmount: null,
						accountCurrency: null,
						accountId: null,
						amount: 40,
						date: "2026-02-01",
						expectedRevision: 1,
						id: `receipt-${index}`,
					});
					await saveLoanBook("owner", next);
					return next;
				}),
			),
		);
		expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
		expect((await loadLoanBook("owner", original.loanId)).revision).toBe(2);
		const [total] = await queryRaw<{ amount: number }>(
			`SELECT SUM("totalPaid") FILTER (WHERE "paidDate" IS NOT NULL) AS amount FROM "LoanPayment" WHERE "loanId"=$1`,
			[original.loanId],
		);
		expect(Number(total.amount)).toBe(40);
		await expect(
			withRawTransaction(async () => {
				const book = await loadLoanBook("owner", original.loanId, true);
				await saveLoanBook(
					"owner",
					applyLoanSimulation(
						book,
						simulateLoanOperation(book, { count: 1, date: "2026-02-02", mode: "BACK" }),
						{ accountAmount: null, accountCurrency: null, accountId: null, id: "rolled-back" },
					),
				);
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		expect((await loadLoanBook("owner", original.loanId)).revision).toBe(2);
		expect(await queryRaw(`SELECT "id" FROM "LoanPayment" WHERE "id"='rolled-back'`)).toHaveLength(0);
	});
	test("portability links contracts without fabricated credit or cash payment", async () => {
		const pair = await withRawTransaction(async () => {
			const source = await insertLoanBook("owner", "bank", terms);
			const successor = await insertLoanBook("owner", "bank", terms);
			const pair = restructureLoanContract(source, {
				expectedRevision: 1,
				institutionId: "bank",
				kind: "PORTABILITY",
				receiptId: "refinance",
				settlementAmount: 1000,
				successorId: successor.loanId,
				terms,
			});
			await saveLoanBook("owner", pair.source);
			await saveLoanBook("owner", pair.successor);
			return pair;
		});
		expect((await loadLoanBook("owner", pair.source.loanId)).successorLoanId).toBe(pair.successor.loanId);
		expect(
			await queryRaw(`SELECT "id" FROM "LoanPayment" WHERE "loanId"=$1`, [pair.source.loanId]),
		).toHaveLength(0);
		expect(await queryRaw(`SELECT "id" FROM "Transaction" WHERE "userId"='owner'`)).toHaveLength(0);
	});
});
