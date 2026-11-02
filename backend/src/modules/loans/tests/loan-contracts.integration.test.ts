import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	applyLoanSimulation,
	type LoanContractTerms,
	recordLoanPayment,
	restructureLoanContract,
	simulateLoanOperation,
} from "@zaimu/finance/loan-contract";
import { Client } from "pg";
import { closeDatabase, db, executeStatement, queryRows, withRawTransaction } from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { insertLoanBook, loadLoanBook, loanPaymentTotals, saveLoanBook } from "../application/loan-contracts";
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
		await executeStatement(
			db.sql.public.user
				.insert([
					{ email: "loan-owner@test.invalid", id: "owner", name: "Owner", role: "USER" },
					{ email: "loan-other@test.invalid", id: "other", name: "Other", role: "USER" },
				])
				.build(),
		);
		await executeStatement(
			db.sql.public.FinancialInstitution.insert([
				{
					currency: "BRL",
					id: "bank",
					name: "Bank",
					normalizedName: "bank",
					operatingCountryCodes: ["BR"],
					status: "APPROVED",
					updatedAt: new Date(),
				},
			]).build(),
		);
	});
	afterAll(() => closeDatabase());
	test("remaining totals exclude distinct paid principal and interest", async () => {
		await withRawTransaction(async () => {
			const book = await insertLoanBook("owner", "bank", terms);
			await executeStatement(
				db.sql.public.LoanPayment.delete()
					.where((fields, ops) => ops.eq(fields.loanId, book.loanId))
					.build(),
			);
			await executeStatement(
				db.sql.public.LoanPayment.insert([
					{
						currency: "BRL",
						dueDate: "2026-02-01",
						id: crypto.randomUUID(),
						installmentNumber: 1,
						interestPaid: "3",
						loanId: book.loanId,
						paidDate: "2026-02-01",
						principalPaid: "11",
						totalPaid: "14",
						updatedAt: new Date(),
					},
					{
						currency: "BRL",
						dueDate: "2026-03-01",
						id: crypto.randomUUID(),
						installmentNumber: 2,
						interestPaid: "17",
						loanId: book.loanId,
						paidDate: null,
						principalPaid: "101",
						totalPaid: "118",
						updatedAt: new Date(),
					},
				]).build(),
			);
			const totals = await loanPaymentTotals(book.loanId);
			expect(Number(totals.count)).toBe(1);
			expect(Number(totals.principal)).toBe(101);
			expect(Number(totals.interest)).toBe(17);
		});
	});

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
		const [total] = await queryRows(
			db.sql.public.LoanPayment.select("amount", (fields, ops) => ops.sum(fields.totalPaid))
				.where((fields, ops) =>
					ops.and(
						ops.eq(fields.loanId, original.loanId),
						ops.raw`${fields.paidDate} IS NOT NULL`.returns("pg/bool@1"),
					),
				)
				.build(),
		);
		expect(Number(total.amount)).toBe(40);
		const persisted = await queryRows(
			db.sql.public.LoanPayment.select("dueDate", "principalPaid", "totalPaid")
				.where((fields, ops) => ops.eq(fields.loanId, original.loanId))
				.build(),
		);
		expect(persisted.length).toBeGreaterThan(0);
		for (const payment of persisted) {
			expect(payment.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(typeof payment.principalPaid).toBe("number");
			expect(typeof payment.totalPaid).toBe("number");
		}

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
		expect(
			await queryRows(
				db.sql.public.LoanPayment.select("id")
					.where((fields, ops) => ops.eq(fields.id, "rolled-back"))
					.build(),
			),
		).toHaveLength(0);
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
			await queryRows(
				db.sql.public.LoanPayment.select("id")
					.where((fields, ops) => ops.eq(fields.loanId, pair.source.loanId))
					.build(),
			),
		).toHaveLength(0);
		expect(
			await queryRows(
				db.sql.public.Transaction.select("id")
					.where((fields, ops) => ops.eq(fields.userId, "owner"))
					.build(),
			),
		).toHaveLength(0);
	});
});
