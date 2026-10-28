import {
	activeLoanVersion,
	type LoanContractBook,
	type LoanContractTerms,
	outstandingLoanSchedule,
} from "./loan-contract";
export interface LegacyLoanRow {
	id: string;
	institutionId?: string | null;
	principalAmount: number;
	interestRate: number;
	currency?: string;
	startDate: string;
	firstDueDate: string;
	totalInstallments: number;
	amortization: "PRICE" | "SAC";
}
export interface LegacyLoanPaymentRow {
	id: string;
	loanId: string;
	installmentNumber: number;
	dueDate: string;
	principalPaid: number;
	interestPaid: number;
	totalPaid: number;
	paidDate?: string | null;
	financialAccountId?: string | null;
	accountAmount?: number | null;
	accountCurrency?: string | null;
}
/** Legacy receipts are preserved exactly. No institution inference and no retroactive disbursement. */
export function legacyLoanBook(loan: LegacyLoanRow, payments: LegacyLoanPaymentRow[]): LoanContractBook {
	const terms: LoanContractTerms = {
		amortization: loan.amortization,
		charges: [],
		currency: loan.currency ?? "BRL",
		discount: "PRESENT_VALUE",
		firstDueDate: loan.firstDueDate.slice(0, 10),
		graceInterest: "PAY",
		graceMonths: 0,
		lateFinePercent: 0,
		lateMonthlyPercent: 0,
		principalAmount: loan.principalAmount,
		rate: { fixedPeriod: "MONTHLY", fixedRate: loan.interestRate * 100 },
		startDate: loan.startDate.slice(0, 10),
		totalInstallments: loan.totalInstallments,
	};
	let balance = payments.filter(row => !row.paidDate).reduce((sum, row) => sum + row.principalPaid, 0);
	return {
		institutionId: loan.institutionId ?? null,
		loanId: loan.id,
		receipts: payments
			.filter(row => row.paidDate)
			.map(row => ({
				accountAmount: row.accountAmount ?? null,
				accountCurrency: row.accountCurrency ?? null,
				accountId: row.financialAccountId ?? null,
				allocations: [],
				amount: row.totalPaid,
				date: row.paidDate!.slice(0, 10),
				id: row.id,
				kind: "PAYMENT",
				lateCharges: 0,
			})),
		revision: 1,
		versions: [
			{
				effectiveDate: terms.startDate,
				reason: "CREATE",
				revision: 1,
				schedule: payments
					.filter(row => !row.paidDate)
					.sort((a, b) => a.installmentNumber - b.installmentNumber)
					.map(row => {
						balance -= row.principalPaid;
						return {
							balance: Math.max(0, balance),
							charges: row.totalPaid - row.principalPaid - row.interestPaid,
							dueDate: row.dueDate.slice(0, 10),
							id: `1:${row.installmentNumber}`,
							interest: row.interestPaid,
							number: row.installmentNumber,
							principal: row.principalPaid,
						};
					}),
				terms,
			},
		],
	};
}
/** Compatibility ledger feeds existing balances/reports without duplicating receipts or forecast installments. */
export function loanBookPaymentRows(
	book: LoanContractBook,
): (LegacyLoanPaymentRow & { currency: string; isAdvanced: boolean; advanceType: null })[] {
	const currency = activeLoanVersion(book).terms.currency;
	return [
		...book.receipts
			.filter(row => row.kind !== "REFINANCE")
			.map((receipt, index) => ({
				accountAmount: receipt.accountAmount,
				accountCurrency: receipt.accountCurrency,
				advanceType: null,
				currency,
				dueDate: receipt.date,
				financialAccountId: receipt.accountId,
				id: receipt.id,
				installmentNumber: -(index + 1),
				interestPaid: receipt.allocations.reduce((sum, row) => sum + row.interest, 0),
				isAdvanced: receipt.kind === "ADVANCE" || receipt.kind === "PAYOFF",
				loanId: book.loanId,
				paidDate: receipt.date,
				principalPaid: receipt.allocations.reduce((sum, row) => sum + row.principal, 0),
				totalPaid: receipt.amount,
			})),
		...outstandingLoanSchedule(book).map(row => ({
			accountAmount: null,
			accountCurrency: null,
			advanceType: null,
			currency,
			dueDate: row.dueDate,
			financialAccountId: null,
			id: `${book.loanId}:${row.id}`,
			installmentNumber: row.number,
			interestPaid: row.interest,
			isAdvanced: false,
			loanId: book.loanId,
			paidDate: null,
			principalPaid: row.principal,
			totalPaid: row.principal + row.interest + row.charges,
		})),
	];
}
