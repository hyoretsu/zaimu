import { expect, test } from "bun:test";
import {
	createLoanContract,
	type LoanContractTerms,
	recordLoanPayment,
	restructureLoanContract,
} from "@zaimu/finance/loan-contract";
import { loanBookPaymentRows } from "@zaimu/finance/loan-legacy";
import { IDBFactory } from "fake-indexeddb";
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
	rate: { fixedRate: 0 },
	startDate: "2026-01-01",
	totalInstallments: 10,
};
test("contract, partial receipts and refinancing commit atomically and reject stale tabs", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("../localStorage");
	const owner = "guest:contract_storage";
	const book = createLoanContract("contract", "bank", terms);
	const loan = {
		amortization: "SAC" as const,
		contractBook: book,
		currency: "BRL",
		dueDay: 1,
		firstDueDate: terms.firstDueDate,
		id: book.loanId,
		installmentAmount: 100,
		institutionId: "bank",
		interestRate: 0,
		lender: "Bank",
		principalAmount: 1000,
		startDate: terms.startDate,
		totalInstallments: 10,
		userId: "guest",
	};
	await storage.commitLocalLoanContract(loan, loanBookPaymentRows(book), null, owner);
	const paid = recordLoanPayment(book, {
		accountAmount: null,
		accountCurrency: null,
		accountId: null,
		amount: 40,
		date: "2026-02-01",
		expectedRevision: 1,
		id: "partial",
	});
	await storage.commitLocalLoanContract(
		{ ...loan, contractBook: paid },
		loanBookPaymentRows(paid),
		1,
		owner,
	);
	await expect(storage.commitLocalLoanContract(loan, loanBookPaymentRows(book), 1, owner)).rejects.toThrow(
		"Contrato mudou",
	);
	expect((await storage.localLoanPayments.getAll(owner)).filter(row => row.data.paidDate)).toHaveLength(1);
	expect(await storage.localLoans.getAll("guest:someone_else")).toHaveLength(0);
	const pair = restructureLoanContract(paid, {
		expectedRevision: 2,
		institutionId: "bank",
		kind: "PORTABILITY",
		receiptId: "refinance",
		settlementAmount: 960,
		successorId: "successor",
		terms: { ...terms, firstDueDate: "2026-03-01", principalAmount: 960, startDate: "2026-02-02" },
	});
	const successor = { ...loan, contractBook: pair.successor, id: "successor" };
	await storage.commitLocalLoanContracts(
		[
			{
				expectedRevision: 2,
				loan: { ...loan, contractBook: pair.source },
				payments: loanBookPaymentRows(pair.source),
			},
			{ expectedRevision: null, loan: successor, payments: loanBookPaymentRows(pair.successor) },
		],
		owner,
	);
	expect((await storage.localLoans.getById("contract", owner))!.data.contractBook!.successorLoanId).toBe(
		"successor",
	);
	expect(
		(await storage.localLoanPayments.getAll(owner))
			.filter(row => row.data.paidDate)
			.reduce((sum, row) => sum + row.data.totalPaid, 0),
	).toBe(40);
	await expect(
		storage.commitLocalLoanContracts(
			[
				{ expectedRevision: 3, loan: { ...loan, contractBook: book }, payments: [] },
				{ expectedRevision: null, loan: successor, payments: [] },
			],
			owner,
		),
	).rejects.toThrow();
	expect((await storage.localLoans.getById("contract", owner))!.data.contractBook!.revision).toBe(3);
});
