import { type CreditBook, replayCreditBook } from "./credit-book";
import { currentDateKey } from "./credit-card";

/** Carried debt belongs to the receiving cycle; suggest it once, even before that cycle closes. */
export function pendingStatementPayments(book: CreditBook, today = currentDateKey()) {
	const statements = replayCreditBook(book, today).statements;
	return statements.flatMap((statement, index) => {
		const closed = statement.statementDate <= today;
		const remaining = Math.max(
			0,
			Math.min(statement.balanceAmount, closed ? statement.balanceAmount : statement.carriedInAmount),
		);
		if (!remaining) return [];
		const previous = statements.slice(0, index).findLast(row => row.statementDate <= today);
		if (!closed && !previous) return [];
		return [
			{
				amount: remaining,
				creditCardId: book.card.id,
				dueDate: closed ? statement.dueDate : previous!.dueDate,
				statementId: statement.id,
			},
		];
	});
}
