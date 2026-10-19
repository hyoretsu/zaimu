import { type CreditBook, replayCreditBook } from "./credit-book";
import { currentDateKey } from "./credit-card";

/** Carried debt belongs to the receiving cycle; suggest it only after that cycle closes. */
export function pendingStatementPayments(book: CreditBook, today = currentDateKey()) {
	const statements = replayCreditBook(book, today).statements;
	return statements.flatMap(statement => {
		if (statement.statementDate > today || statement.scheduledPaymentAmount > 0) return [];
		const remaining = Math.max(0, statement.balanceAmount);
		if (!remaining) return [];
		return [
			{
				amount: remaining,
				creditCardId: book.card.id,
				currency: book.card.currency ?? "BRL",
				dueDate: statement.dueDate,
				statementDate: statement.statementDate,
				statementId: statement.id,
			},
		];
	});
}

export type InvoicePaymentTiming = "CLOSING_DATE" | "DUE_DATE";

export function suggestedInvoicePaymentDate(
	statement: { statementDate: string; dueDate: string },
	timing: InvoicePaymentTiming = "DUE_DATE",
	today = currentDateKey(),
) {
	const preferred = timing === "CLOSING_DATE" ? statement.statementDate : statement.dueDate;
	return preferred < today ? today : preferred;
}
