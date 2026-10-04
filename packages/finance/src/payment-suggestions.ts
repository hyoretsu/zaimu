import { type CreditBook, replayCreditBook } from "./credit-book";
import { currentDateKey } from "./credit-card";

/** Carried debt belongs to the receiving cycle; suggest it only after that cycle closes. */
export function pendingStatementPayments(book: CreditBook, today = currentDateKey()) {
	const statements = replayCreditBook(book, today).statements;
	return statements.flatMap(statement => {
		if (statement.statementDate > today) return [];
		const remaining = Math.max(0, statement.balanceAmount);
		if (!remaining) return [];
		return [
			{
				amount: remaining,
				creditCardId: book.card.id,
				dueDate: statement.dueDate,
				statementId: statement.id,
			},
		];
	});
}
