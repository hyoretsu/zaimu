import { toCents } from "@zaimu/finance/credit-card";
import type { CreditCardStatement } from "./api";

/** Preserve the signed balance for display after debt or credit moves to another cycle. */
export function getCreditCardStatementDisplayBalance(statement: CreditCardStatement) {
	if (statement.amountDue === undefined || statement.periodPaymentAmount === undefined) {
		return statement.balanceAmount;
	}
	return (
		(toCents(statement.amountDue) -
			toCents(statement.creditInAmount ?? 0) -
			toCents(statement.periodPaymentAmount)) /
		100
	);
}

/** Net total at closing; later payments change only the remaining balance. */
export function getCreditCardStatementInvoiceAmount(statement: CreditCardStatement) {
	return (
		statement.invoiceAmount ??
		statement.manualTotalAmount ??
		(toCents(statement.amountDue ?? statement.totalAmount) -
			toCents(statement.creditInAmount ?? 0) -
			toCents(statement.preClosingPaymentAmount ?? 0)) /
			100
	);
}
