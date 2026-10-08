import type { LoanPayment, Transaction } from "./api";

/** Loan ledger records are actual cash outflows, separate from the original loan amount. */
export function loanAccountMovements(payments: LoanPayment[]): Transaction[] {
	return payments
		.filter(payment => payment.paidDate)
		.map(payment => ({
			amount: payment.accountAmount ?? payment.totalPaid,
			bookingCurrency: payment.accountCurrency ?? payment.currency ?? "BRL",
			createdAt: payment.paidDate!,
			currency: payment.accountCurrency ?? payment.currency ?? "BRL",
			date: payment.paidDate!,
			description: `Parcela ${payment.installmentNumber}`,
			id: `loan-payment:${payment.id}`,
			originFinancialAccountId: payment.financialAccountId,
			type: "EXPENSE",
		}));
}
