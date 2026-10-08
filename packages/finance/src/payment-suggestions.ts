import { type CreditBook, replayCreditBook } from "./credit-book";
import { currentDateKey } from "./credit-card";

/** Carried debt belongs to the receiving cycle; suggest it only after that cycle closes. */
export function pendingStatementPayments(book: CreditBook, today = currentDateKey()) {
	// Scheduled payments already reserve the outstanding balance for suggestion purposes.
	// Keep purchases, refunds and historical balances evaluated at today's date.
	const statements = replayCreditBook(
		{
			...book,
			payments: book.payments.map(payment => ({
				...payment,
				date: payment.date > today ? today : payment.date,
			})),
		},
		today,
	).statements;
	return statements.flatMap(statement => {
		if (statement.statementDate > today) return [];
		const remaining = Math.max(0, statement.balanceAmount);
		if (!remaining) return [];
		return [
			{
				amount: remaining,
				creditCardId: book.card.id,
				currency: book.card.currency ?? "BRL",
				dueDate: statement.dueDate,
				statementId: statement.id,
			},
		];
	});
}
