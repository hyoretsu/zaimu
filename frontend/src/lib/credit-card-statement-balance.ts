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
