import { shiftMonths } from "@zaimu/finance/financial-indicators";
import type { ExistingLoanOffer } from "@zaimu/finance/loan-comparison";
import {
	activeLoanVersion,
	type LoanReference,
	monthlyLoanRate,
	outstandingLoanSchedule,
	simulateLoanOperation,
} from "@zaimu/finance/loan-contract";
import type { Loan } from "@/lib/api";

/** Remaining schedule of a registered contract, priced at today's payoff, for portability comparisons. */
export function existingLoanOffer(
	loan: Loan,
	today: string,
	reference?: LoanReference,
): ExistingLoanOffer | null {
	const book = loan.contractBook;
	if (!book) return null;
	const remaining = outstandingLoanSchedule(book);
	if (remaining.length === 0) return null;
	try {
		const terms = activeLoanVersion(book).terms;
		const payoff = simulateLoanOperation(book, { date: today, mode: "PAYOFF" }, reference);
		return {
			currency: terms.currency,
			date: today,
			id: `existing:${loan.id}`,
			installments: remaining.map(row => ({
				amount: row.principal + row.interest + row.charges,
				dueDate: row.dueDate < today ? today : row.dueDate,
			})),
			kind: "EXISTING",
			monthlyRate: monthlyLoanRate(
				terms,
				today,
				remaining.at(-1)?.dueDate ?? shiftMonths(today, 1),
				reference,
			),
			name: `Atual: ${loan.description || loan.lender}`,
			payoffAmount: payoff.amount,
			prepaymentDiscount: terms.discount === "PRESENT_VALUE",
		};
	} catch {
		return null;
	}
}
