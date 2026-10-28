import type { LoanPayment, Transaction } from "./api";

/** Loan ledger records are actual cash outflows, separate from the original loan amount. */
export function loanAccountMovements(payments: LoanPayment[]): Transaction[] {
	return payments
		.filter(payment => payment.paidDate)
		.map(payment => ({
			amount: Math.abs(payment.accountAmount ?? payment.totalPaid),
			bookingCurrency: payment.accountCurrency ?? payment.currency ?? "BRL",
			createdAt: payment.paidDate!,
			currency: payment.accountCurrency ?? payment.currency ?? "BRL",
			date: payment.paidDate!,
			description: `Parcela ${payment.installmentNumber}`,
			destinationFinancialAccountId:
				(payment.accountAmount ?? payment.totalPaid) < 0 ? payment.financialAccountId : null,
			id: `loan-payment:${payment.id}`,
			originFinancialAccountId:
				(payment.accountAmount ?? payment.totalPaid) < 0 ? null : payment.financialAccountId,
			type: (payment.accountAmount ?? payment.totalPaid) < 0 ? "INCOME" : "EXPENSE",
		}));
}
